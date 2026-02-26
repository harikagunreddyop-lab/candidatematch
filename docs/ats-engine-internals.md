# ATS Engine Internals — Keyword & Experience Dimensions
## Source: `src/lib/ats-engine.ts`

---

## DIMENSION WEIGHTS (how the final 0–100 is assembled)

```
keyword     30%   scoreKeywords()
experience  18%   scoreExperience()
title       14%   scoreTitle()
education    8%   scoreEducation()
location     8%   scoreLocation()
formatting   7%   scoreFormatting()
behavioral   7%   scoreBehavioral()
soft (AI)    8%   scoreSoftFactors()   ← one Claude Haiku call per candidate×job
```

Final formula:
```
total = round(
  keyword.score    * 0.30 +
  experience.score * 0.18 +
  title.score      * 0.14 +
  education.score  * 0.08 +
  location.score   * 0.08 +
  formatting.score * 0.07 +
  behavioral.score * 0.07 +
  soft.score       * 0.08
)
```

Hard caps applied AFTER weighting:
- `title.score ≤ 25`  → `total = min(total, 30)`   (domain mismatch)
- `title.score ≤ 45`  → `total = min(total, 55)`   (adjacent domain)

---

## ══════════════════════════════════════════════
## 1. KEYWORD DIMENSION  (weight: 30%)
## ══════════════════════════════════════════════

### 1a. JD Requirement Extraction (AI — one call per JD, cached)

Claude Haiku extracts from the job description:

```
must_have_skills    — explicitly required technologies (e.g. "required", "must have")
nice_to_have_skills — "preferred", "bonus", "plus", "familiarity with"
implicit_skills     — implied by role even if not listed
                      e.g. "Senior React Developer" implies javascript, html, css, git
behavioral_keywords — action verbs the JD emphasises
context_phrases     — technical capability phrases ("build scalable distributed systems")
```

Rules given to the AI:
- `must_have_skills`: Explicitly required, lowercase, specific
- `nice_to_have_skills`: Preference language only
- `implicit_skills`: Role-implied but unstated
- Returns null for undeterminable fields

Result is cached in `jobs.structured_requirements` so subsequent runs cost zero tokens.

---

### 1b. Candidate Skill Extraction (deterministic)

**Step 1 — Explicit skill list**
Every skill/tool in the candidate's stored `skills[]` and `tools[]` arrays is canonicalized
(see synonym map below) and added with prominence weight `+1.5`.

**Step 2 — Section-aware resume scan**
Resume text is split into sections. Each section gets a detection weight:

```
skills section      weight = 1.5   (highest — skills listed here are intentional)
summary section     weight = 1.2
projects section    weight = 0.9
certifications      weight = 0.8
experience section  weight = 1.0
education section   weight = 0.5   (lowest)
```

Every synonym group is scanned against each section. On a match, the canonical skill
is added, and its prominence score increases by `(occurrence_count × section_weight)`.

**Step 3 — Contextual phrase extraction**
14 regex patterns are tested against the full resume text. Matches imply skills:

```
/built? (?:rest|api|endpoint)/        → ['rest', 'api development']
/scaled? (?:system|service|app)/      → ['scalability', 'distributed systems']
/deploy(?:ed)? to (?:cloud|aws|gcp)/  → ['cloud architecture', 'devops']
/train(?:ed)? (?:model|neural|ml)/    → ['machine learning', 'python']
/(?:million|billion|10k\+) (?:user)/  → ['scalability', 'performance']
... (14 patterns total)
```
Implied skills from phrase matches receive prominence `+0.5`.

**Step 4 — Implications graph expansion**
If a candidate has skill X, all of X's implied skills are added at prominence `+0.3`:

```
'distributed systems'  → microservices, kafka, redis, load balancing, scalability
'cloud architecture'   → aws, gcp, azure, terraform, kubernetes, docker, iac
'full stack'           → javascript, react, node, sql, rest, html, css
'machine learning'     → python, tensorflow, pytorch, scikit-learn, numpy, pandas
'devops'               → docker, kubernetes, ci/cd, terraform, jenkins, linux
'data pipeline'        → spark, airflow, kafka, sql, python, etl
... (21 concept groups total)
```

**Step 5 — Recency weighting**
Each work experience entry is classified as recent (`end_year ≥ now - 2`) or old.
Skills found in job titles and responsibilities get tagged accordingly:
- `recentSkills` — used in a role ended within last 2 years
- `oldSkills`    — used in roles older than 2 years

---

### 1c. Matching Logic (per required skill)

For each required skill (canonicalized), the check is:
```
directMatch = expandedSkillSet.has(skill)     // profile + implications graph + phrases
textMatch   = !directMatch && resumeLower.includes(skill)   // raw text fallback
found = directMatch || textMatch
```

Score contribution per skill depends on its type:

**MUST-HAVE skills** (weight: 65% of keyword score):
```
if found:
    prominence_factor = min(1.0, prominence * 0.3 + 0.7)
    recency_factor    = 1.0  if skill in recentSkills
                      = 0.7  if skill in oldSkills
                      = 0.85 if unknown recency
    contribution = prominence_factor × recency_factor
    (contributes to mustScore)
if not found:
    skill added to missing[] list
```

**NICE-TO-HAVE skills** (weight: 20% of keyword score):
```
if found:
    contribution = 1.0 if skill in recentSkills, else 0.8
if not found:
    no penalty
```

**IMPLICIT skills** (weight: 15% of keyword score):
```
if found:
    contribution = 0.8 (flat — implied skills are less certain)
if not found:
    no penalty
```

---

### 1d. Keyword Score Calculation

```
mustRatio     = mustScore / mustTotal        (or 1.0 if no must-haves)
niceRatio     = niceScore / niceTotal        (or 0.5 if no nice-to-haves)
implicitRatio = implicitScore / implicitTotal (or 0.5 if no implicit)

raw = (mustRatio × 0.65 + niceRatio × 0.20 + implicitRatio × 0.15) × 100
```

**Penalties applied to `raw` before clamping:**

| Condition | Penalty |
|-----------|---------|
| `mustTotal > 0` AND `mustScore == 0` (zero must-haves matched) | `raw = min(raw, 15)` |
| `mustTotal ≥ 3` AND `mustRatio < 0.33` (less than 1/3 of must-haves) | `raw = min(raw, 30)` |
| `mustTotal ≥ 3` AND `mustRatio < 0.5` (less than half of must-haves) | `raw -= 10` |

Final: `score = max(0, min(100, round(raw)))`

---

### 1e. Synonym Map (70+ canonical groups, partial list)

The map normalises variants to one canonical form before any comparison:

```
javascript / js / ecmascript / es6 / es2015 / es2020  →  "javascript"
typescript / ts                                         →  "typescript"
react / react.js / reactjs / react js                  →  "react"
java / java se / j2ee / java 8 / java 11 / java 17     →  "java"
spring / spring boot / spring framework / springboot    →  "spring"
c# / csharp / c sharp / .net / dotnet / asp.net        →  "c#"
go / golang / go lang                                   →  "go"
sql / structured query language                         →  "sql"
postgresql / postgres / psql / pg                       →  "postgresql"
mongodb / mongo / mongo db / nosql                      →  "mongodb"
aws / amazon web services / amazon aws                  →  "aws"
kubernetes / k8s / kube / eks / aks / gke              →  "kubernetes"
ci/cd / cicd / ci cd / continuous integration / ...     →  "ci/cd"
git / github / gitlab / bitbucket / version control     →  "git"
machine learning / ml / deep learning / dl              →  "machine learning"
... (70 groups total — see SYNONYM_GROUPS in source)
```

---

## ══════════════════════════════════════════════
## 2. EXPERIENCE DIMENSION  (weight: 18%)
## ══════════════════════════════════════════════

### 2a. Min Years Parsing from JD

The AI extracts `min_years_experience` and `preferred_years_experience` as numbers (or null).

If the AI returns null AND a `seniority_level` is present, the engine falls back to this
hard-coded seniority-to-years table:

```
intern:    [0,  0]
junior:    [0,  2]
mid:       [2,  5]
senior:    [5,  8]
staff:     [8, 12]
principal: [12, 20]
lead:      [5, 10]
manager:   [6, 12]
director:  [10, 20]
```

`targetMin = first value`, `targetMax = second value`

---

### 2b. Candidate Years Computation (how it becomes a number)

**Primary source:** `candidate.years_of_experience` (stored on the profile).
This is the value entered/autofilled on the candidate profile page.

**Fallback (if profile value is null):** Computed from the experience array:
```
dates = experience
  .filter(e => e.start_date exists)
  .map(e => new Date(e.start_date).getFullYear())

if dates.length > 0:
    years = currentYear - min(dates)   // earliest start year to today
else:
    years = 0
```

⚠️ **Known limitation of the fallback:** It counts from earliest start date to now, 
which overestimates for candidates with career gaps or who switched fields. 
It does NOT sum individual role durations — it uses the span of the entire career.
The profile-stored `years_of_experience` field (set by AI autofill or recruiter) is 
always preferred and more accurate.

---

### 2c. Recency Weighting Formula

```
target = preferred_years_experience  (if set)
       OR min_years_experience        (if only min is set)

if years >= target:
    yearsScore = 100    ("meets or exceeds requirement")

elif years >= targetMin:
    ratio      = (years - targetMin) / max(1, target - targetMin)
    yearsScore = round(75 + ratio × 25)    ("within the acceptable range: 75–100")

else:
    gap = targetMin - years
    yearsScore = gap <= 1  ? 60           ("1 year under — close enough")
               : gap <= 2  ? 40           ("2 years under — borderline")
               : max(10, 40 - gap × 8)    ("significantly under — steep falloff")
```

Score examples:
| Requirement | Candidate | Score |
|-------------|-----------|-------|
| 5 yr min / 8 yr pref | 9 years | 100 |
| 5 yr min / 8 yr pref | 6 years | 83 |
| 5 yr min / 8 yr pref | 5 years | 75 |
| 5 yr min / 8 yr pref | 4 years (1 under) | 60 |
| 5 yr min / 8 yr pref | 3 years (2 under) | 40 |
| 5 yr min / 8 yr pref | 1 year (4 under) | 8 |
| No requirement | any | 70 (neutral) |

---

### 2d. Industry Vertical Bonus

After computing `yearsScore`, a vertical alignment check is run:

```
if requirements.industry_vertical is set:
    candidateVertical = detectVertical(resumeText)
    if candidateVertical === requirements.industry_vertical:
        verticalBonus = +10   ("same industry — fintech, healthtech, etc.")
    else:
        verticalBonus = 0     (no penalty for different industry)

finalScore = min(100, yearsScore + verticalBonus)
```

Industry detection works by counting keyword occurrences across 12 verticals
(fintech, healthtech, ecommerce, saas, adtech, edtech, gaming, cybersecurity,
ai_ml, cloud, media, logistics). A vertical is reported only if ≥ 2 of its
keywords appear in the resume.

---

## ══════════════════════════════════════════════
## 3. NORMALIZATION TO 0–100
## ══════════════════════════════════════════════

Each dimension produces a 0–100 score independently. They are then combined:

```
total = round(sum of dimension_score × weight)

Post-processing caps:
  if title.score ≤ 25:  total = min(total, 30)   // hard cap — complete domain mismatch
  if title.score ≤ 45:  total = min(total, 55)   // soft cap — adjacent/unclear domain

final = max(0, min(100, total))
```

Score interpretation:
```
≥ 82   Strong match
75–81  Moderate match
50–74  Below threshold
< 50   Poor fit (apply blocked if ATS score exists and < 50)
```

---

## ══════════════════════════════════════════════
## 4. AI SOFT FACTORS DIMENSION (weight: 8%)
## ══════════════════════════════════════════════

One Claude Haiku call per candidate×job. NOT cached. Evaluates:

```
1. Career trajectory  (30%) — is the career path heading toward this role?
2. Domain depth       (25%) — deep expertise vs surface-level familiarity?
3. Growth potential   (20%) — could this candidate grow into the role?
4. Culture signals    (15%) — writing style, achievement framing, mindset?
5. Red flags          (10%) — gaps, job hopping, generic language? (deductive)
```

The AI receives:
- Job title + first 600 chars of JD
- Candidate primary title + first 1800 chars of resume text
- Context: count of matched/missing keywords from the deterministic pass
- Behavioral analysis summary

Returns: `{ "score": 0–100, "details": "one sentence" }`

---

## ══════════════════════════════════════════════
## 5. RESUME SECTION DETECTION
## ══════════════════════════════════════════════

Used by both keyword scoring (section weights) and formatting scoring.

Section headers are detected by pattern on lines shorter than 60 chars:

```
/^(technical\s+)?skills|core\s+competenc|technologies/  → 'skills'      weight 1.5
/^summary|objective|profile|about/                       → 'summary'     weight 1.2
/^(work\s+)?experience|employment|professional/          → 'experience'  weight 1.0
/^education|academic/                                    → 'education'   weight 0.5
/^certif|licenses/                                       → 'certs'       weight 0.8
/^project|portfolio/                                     → 'projects'    weight 0.9
```

If no sections are detected, the whole resume is treated as one 'unknown' section
at weight 1.0.

---

## ══════════════════════════════════════════════
## 6. COMPLETE DATA FLOW
## ══════════════════════════════════════════════

```
JD uploaded
  └─ extractJobRequirements()    [1 AI call, cached in jobs.structured_requirements]
       └─ must_have / nice_to_have / implicit / seniority / min_years / behavioral_kw

Recruiter clicks "ATS" button on a candidate
  └─ runAtsCheck() in matching.ts
       └─ Picks best resume across all uploaded PDFs (runs all in parallel, keeps highest)
       └─ computeATSScore()
            ├─ parseResumeSections()           deterministic
            ├─ scoreKeywords()                 deterministic — synonym map, implications, recency
            ├─ scoreExperience()               deterministic — years formula above
            ├─ scoreTitle()                    deterministic — domain classification
            ├─ scoreEducation()                deterministic — degree rank table
            ├─ scoreLocation()                 deterministic — city match + visa check
            ├─ scoreFormatting()               deterministic — section presence, metrics, dates
            ├─ scoreBehavioral()               deterministic — regex patterns
            └─ scoreSoftFactors()              [1 AI call — Claude Haiku]
                 └─ weighted sum → total_score (0–100)
```

AI calls per ATS check: **max 2** (1 JD extraction if not cached + 1 soft factor)
If JD already cached: **1 AI call only**

---

*Last updated: based on `src/lib/ats-engine.ts` as of current codebase.*
