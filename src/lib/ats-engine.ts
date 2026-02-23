/**
 * Multi-Dimensional ATS Scoring Engine
 *
 * Mirrors real ATS systems (Workday, Greenhouse, Lever, iCIMS) with:
 * 1. Structured JD requirement extraction (AI, cached per job)
 * 2. Deterministic keyword matching with synonym resolution
 * 3. Experience level scoring
 * 4. Education requirement matching
 * 5. Role/title alignment scoring
 * 6. Location & visa compatibility
 * 7. AI-powered nuanced evaluation for soft factors
 *
 * Final score = weighted combination of all dimensions.
 */

import { error as logError, log as devLog } from '@/lib/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// ── Weights (must sum to 1.0) ────────────────────────────────────────────────
const W = {
  keyword:    0.35,
  experience: 0.20,
  title:      0.15,
  education:  0.10,
  location:   0.10,
  soft:       0.10,
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface JobRequirements {
  must_have_skills: string[];
  nice_to_have_skills: string[];
  min_years_experience: number | null;
  preferred_years_experience: number | null;
  seniority_level: string | null;
  required_education: string | null;
  preferred_education_fields: string[];
  certifications: string[];
  location_type: 'remote' | 'hybrid' | 'onsite' | null;
  location_city: string | null;
  visa_sponsorship: boolean | null;
  domain: string;
}

export interface DimensionScore {
  score: number;
  details: string;
  matched?: string[];
  missing?: string[];
}

export interface ATSScoreResult {
  total_score: number;
  dimensions: {
    keyword: DimensionScore;
    experience: DimensionScore;
    title: DimensionScore;
    education: DimensionScore;
    location: DimensionScore;
    soft: DimensionScore;
  };
  reason: string;
  matched_keywords: string[];
  missing_keywords: string[];
}

interface CandidateData {
  primary_title?: string;
  secondary_titles?: string[];
  skills: string[];
  tools?: string[];
  experience: Array<{ company: string; title: string; start_date?: string; end_date?: string; current?: boolean; responsibilities?: string[] }>;
  education: Array<{ institution?: string; degree?: string; field?: string; graduation_date?: string; gpa?: string }>;
  certifications: Array<{ name: string; issuer?: string }>;
  location?: string;
  visa_status?: string;
  years_of_experience?: number;
  open_to_remote?: boolean;
  open_to_relocation?: boolean;
  target_locations?: string[];
  resume_text: string;
}

// ── Skill Synonym Database ───────────────────────────────────────────────────

const SYNONYM_GROUPS: string[][] = [
  ['javascript', 'js', 'ecmascript', 'es6', 'es2015'],
  ['typescript', 'ts'],
  ['react', 'react.js', 'reactjs', 'react js'],
  ['react native', 'reactnative'],
  ['angular', 'angular.js', 'angularjs', 'angular 2+'],
  ['vue', 'vue.js', 'vuejs', 'vue 3'],
  ['next.js', 'nextjs', 'next js', 'next'],
  ['node', 'node.js', 'nodejs', 'node js'],
  ['express', 'express.js', 'expressjs'],
  ['python', 'python3', 'python 3'],
  ['java', 'java se', 'java ee', 'j2ee'],
  ['spring', 'spring boot', 'spring framework', 'springboot'],
  ['c#', 'csharp', 'c sharp', '.net', 'dotnet'],
  ['c++', 'cpp', 'c plus plus'],
  ['go', 'golang', 'go lang'],
  ['rust', 'rust lang', 'rustlang'],
  ['ruby', 'ruby on rails', 'rails', 'ror'],
  ['php', 'laravel', 'symfony'],
  ['swift', 'swiftui'],
  ['kotlin', 'kotlin/jvm'],
  ['sql', 'structured query language'],
  ['mysql', 'my sql'],
  ['postgresql', 'postgres', 'psql', 'pg'],
  ['mongodb', 'mongo', 'mongo db'],
  ['redis', 'redis cache'],
  ['elasticsearch', 'elastic search', 'elastic', 'opensearch'],
  ['kafka', 'apache kafka'],
  ['rabbitmq', 'rabbit mq', 'amqp'],
  ['aws', 'amazon web services', 'amazon aws'],
  ['gcp', 'google cloud', 'google cloud platform'],
  ['azure', 'microsoft azure', 'ms azure'],
  ['docker', 'containerization', 'containers'],
  ['kubernetes', 'k8s', 'kube'],
  ['terraform', 'terraform iac', 'tf'],
  ['ansible', 'ansible automation'],
  ['jenkins', 'jenkins ci'],
  ['ci/cd', 'cicd', 'ci cd', 'continuous integration', 'continuous deployment'],
  ['git', 'github', 'gitlab', 'bitbucket', 'version control'],
  ['rest', 'rest api', 'restful', 'restful api'],
  ['graphql', 'graph ql'],
  ['grpc', 'g rpc'],
  ['microservices', 'micro services', 'micro-services'],
  ['machine learning', 'ml', 'deep learning', 'dl'],
  ['artificial intelligence', 'ai'],
  ['nlp', 'natural language processing'],
  ['computer vision', 'cv', 'image recognition'],
  ['tensorflow', 'tf', 'tensor flow'],
  ['pytorch', 'py torch', 'torch'],
  ['scikit-learn', 'sklearn', 'scikit learn'],
  ['pandas', 'pd'],
  ['numpy', 'np'],
  ['spark', 'apache spark', 'pyspark'],
  ['hadoop', 'apache hadoop', 'hdfs'],
  ['airflow', 'apache airflow'],
  ['dbt', 'data build tool'],
  ['snowflake', 'snowflake db'],
  ['databricks', 'data bricks'],
  ['tableau', 'tableau desktop'],
  ['power bi', 'powerbi', 'power-bi'],
  ['html', 'html5'],
  ['css', 'css3', 'scss', 'sass', 'less'],
  ['tailwind', 'tailwind css', 'tailwindcss'],
  ['bootstrap', 'bootstrap 5'],
  ['webpack', 'webpack 5'],
  ['vite', 'vitejs'],
  ['agile', 'scrum', 'kanban'],
  ['jira', 'atlassian jira'],
  ['figma', 'figma design'],
  ['linux', 'unix', 'ubuntu', 'centos', 'debian'],
];

const synonymMap = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canonical = group[0];
  for (const term of group) {
    synonymMap.set(term.toLowerCase(), canonical);
  }
}

function canonicalize(skill: string): string {
  const lower = skill.toLowerCase().trim();
  return synonymMap.get(lower) || lower;
}

function normalizeSkillSet(skills: string[]): Set<string> {
  const set = new Set<string>();
  for (const s of skills) {
    if (!s) continue;
    set.add(canonicalize(s));
  }
  return set;
}

// ── 1. JD Requirement Extraction (AI, one-time per job) ──────────────────────

export async function extractJobRequirements(
  jobTitle: string,
  jobDescription: string,
  jobLocation?: string,
): Promise<JobRequirements | null> {
  if (!ANTHROPIC_API_KEY || !jobDescription) return null;

  const prompt = `You are a senior technical recruiter. Extract structured requirements from this job description.

JOB TITLE: ${jobTitle}
LOCATION: ${jobLocation || 'Not specified'}

JOB DESCRIPTION:
${jobDescription.slice(0, 3000)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "must_have_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill1", "skill2"],
  "min_years_experience": <number or null>,
  "preferred_years_experience": <number or null>,
  "seniority_level": "<junior|mid|senior|staff|principal|lead|manager|director|null>",
  "required_education": "<high_school|associate|bachelor|master|phd|null>",
  "preferred_education_fields": ["Computer Science", "Engineering"],
  "certifications": ["AWS Solutions Architect"],
  "location_type": "<remote|hybrid|onsite|null>",
  "location_city": "<city, state or null>",
  "visa_sponsorship": <true|false|null>,
  "domain": "<software-engineering|frontend|backend|fullstack|data-engineering|data-science|devops|mobile|qa|security|management|design|general>"
}

Rules:
- Extract skills as individual technologies/tools/frameworks, not vague categories
- Must-have = explicitly required or listed under "Requirements"
- Nice-to-have = "preferred", "bonus", "nice to have", "plus"
- Infer seniority from title and years if not explicit
- Return null for fields that cannot be determined
- Keep skill names lowercase and concise`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as JobRequirements;
  } catch (e) {
    logError('[ats-engine] JD extraction failed', e);
    return null;
  }
}

// ── 2. Keyword Matching (Deterministic) ──────────────────────────────────────

function scoreKeywords(
  requirements: JobRequirements,
  candidateSkills: string[],
  candidateTools: string[],
  resumeText: string,
): DimensionScore {
  const allCandidate = normalizeSkillSet([...candidateSkills, ...candidateTools]);
  const resumeLower = resumeText.toLowerCase();

  const mustHave = requirements.must_have_skills.map(s => canonicalize(s));
  const niceToHave = requirements.nice_to_have_skills.map(s => canonicalize(s));

  const matched: string[] = [];
  const missing: string[] = [];

  let mustHaveMatched = 0;
  let mustHaveTotal = mustHave.length || 1;

  for (const skill of mustHave) {
    const found = allCandidate.has(skill) || resumeLower.includes(skill);
    if (found) {
      mustHaveMatched++;
      matched.push(skill);
    } else {
      missing.push(skill);
    }
  }

  let niceMatched = 0;
  let niceTotal = niceToHave.length || 1;

  for (const skill of niceToHave) {
    const found = allCandidate.has(skill) || resumeLower.includes(skill);
    if (found) {
      niceMatched++;
      matched.push(skill);
    }
  }

  const mustHaveRatio = mustHaveMatched / mustHaveTotal;
  const niceRatio = niceMatched / niceTotal;

  // Must-have carries 75% weight, nice-to-have 25%
  const raw = (mustHaveRatio * 0.75 + niceRatio * 0.25) * 100;

  // Penalize heavily if missing critical must-haves
  let penalty = 0;
  if (mustHave.length > 0 && mustHaveMatched === 0) penalty = 40;
  else if (mustHave.length >= 3 && mustHaveRatio < 0.33) penalty = 25;
  else if (mustHave.length >= 3 && mustHaveRatio < 0.5) penalty = 15;

  const score = Math.max(0, Math.min(100, Math.round(raw - penalty)));

  const pct = mustHave.length > 0 ? `${mustHaveMatched}/${mustHave.length} must-have` : 'No explicit requirements';
  const nicePct = niceToHave.length > 0 ? `, ${niceMatched}/${niceToHave.length} nice-to-have` : '';

  return {
    score,
    details: `${pct}${nicePct}`,
    matched,
    missing,
  };
}

// ── 3. Experience Level Scoring ──────────────────────────────────────────────

const SENIORITY_YEARS: Record<string, [number, number]> = {
  junior:    [0, 2],
  mid:       [2, 5],
  senior:    [5, 8],
  staff:     [8, 12],
  principal: [12, 20],
  lead:      [5, 10],
  manager:   [6, 12],
  director:  [10, 20],
};

function scoreExperience(
  requirements: JobRequirements,
  candidateYears: number | null,
  candidateExperience: CandidateData['experience'],
): DimensionScore {
  const reqMin = requirements.min_years_experience;
  const reqPref = requirements.preferred_years_experience;
  const seniority = requirements.seniority_level;

  // Estimate years from experience array if not provided
  let years = candidateYears;
  if (years == null && candidateExperience.length > 0) {
    const dates = candidateExperience
      .map(e => e.start_date ? new Date(e.start_date).getFullYear() : null)
      .filter(Boolean) as number[];
    if (dates.length > 0) {
      const earliest = Math.min(...dates);
      years = new Date().getFullYear() - earliest;
    }
  }
  if (years == null) years = 0;

  // If no requirements specified, use seniority level to infer
  let targetMin = reqMin;
  let targetMax = reqPref;
  if (targetMin == null && seniority && SENIORITY_YEARS[seniority]) {
    [targetMin, targetMax] = SENIORITY_YEARS[seniority];
  }

  if (targetMin == null) {
    return { score: 70, details: `${years} years experience (no requirement specified)` };
  }

  const target = targetMax || targetMin;

  if (years >= target) {
    return { score: 100, details: `${years}yr meets ${target}yr+ requirement` };
  }
  if (years >= targetMin) {
    const ratio = (years - targetMin) / Math.max(1, target - targetMin);
    const score = Math.round(75 + ratio * 25);
    return { score, details: `${years}yr within ${targetMin}-${target}yr range` };
  }

  // Below minimum
  const gap = targetMin - years;
  if (gap <= 1) {
    return { score: 60, details: `${years}yr, ~${gap}yr below ${targetMin}yr minimum` };
  }
  if (gap <= 2) {
    return { score: 40, details: `${years}yr, ${gap}yr below ${targetMin}yr minimum` };
  }
  return { score: Math.max(10, 40 - gap * 8), details: `${years}yr, ${gap}yr below ${targetMin}yr minimum` };
}

// ── 4. Title/Role Alignment ──────────────────────────────────────────────────

function scoreTitle(
  requirements: JobRequirements,
  jobTitle: string,
  candidateTitle: string,
  secondaryTitles: string[],
): DimensionScore {
  const jobLower = jobTitle.toLowerCase();
  const candLower = candidateTitle.toLowerCase();
  const allTitles = [candLower, ...secondaryTitles.map(t => t.toLowerCase())];

  // Exact or near-exact title match
  for (const t of allTitles) {
    if (t === jobLower || jobLower.includes(t) || t.includes(jobLower)) {
      return { score: 100, details: `Direct title match: "${candidateTitle}"` };
    }
  }

  // Domain alignment check
  const jobDomain = requirements.domain;
  const candidateDomains = allTitles.map(t => classifyTitleDomain(t));

  if (candidateDomains.includes(jobDomain)) {
    return { score: 85, details: `Same domain: ${jobDomain}` };
  }

  // Check domain compatibility
  const COMPATIBLE: Record<string, string[]> = {
    'software-engineering': ['fullstack', 'backend', 'frontend'],
    'frontend': ['fullstack', 'software-engineering'],
    'backend': ['fullstack', 'software-engineering'],
    'fullstack': ['frontend', 'backend', 'software-engineering'],
    'data-engineering': ['data-science', 'backend'],
    'data-science': ['data-engineering'],
    'devops': ['software-engineering', 'backend'],
    'mobile': ['frontend', 'fullstack'],
  };

  const jobCompat = COMPATIBLE[jobDomain] || [];
  const hasCompatible = candidateDomains.some(d => jobCompat.includes(d));

  if (hasCompatible) {
    return { score: 65, details: `Adjacent domain: candidate=${candidateDomains[0]}, job=${jobDomain}` };
  }

  // Seniority level alignment (separate from domain)
  const jobSeniority = extractSeniority(jobLower);
  const candSeniority = extractSeniority(candLower);
  const seniorityBonus = jobSeniority === candSeniority ? 10 : 0;

  if (candidateDomains.includes('general')) {
    return { score: 45 + seniorityBonus, details: `Generic title, job is ${jobDomain}` };
  }

  return { score: Math.max(10, 25 + seniorityBonus), details: `Domain mismatch: candidate=${candidateDomains[0]}, job=${jobDomain}` };
}

function classifyTitleDomain(title: string): string {
  const t = title.toLowerCase();
  if (/data\s*(engineer|architect|platform|pipeline|warehouse)|etl|big\s*data/i.test(t)) return 'data-engineering';
  if (/data\s*(scien|analy)|machine\s*learn|\bml\b|\bai\b|deep\s*learn|\bnlp\b/i.test(t)) return 'data-science';
  if (/devops|\bsre\b|site\s*reliab|cloud\s*(eng|arch)|platform\s*eng|infrastructure/i.test(t)) return 'devops';
  if (/full[\s-]*stack/i.test(t)) return 'fullstack';
  if (/front[\s-]*end|ui\s*(dev|eng)|react\s*(dev|eng)|angular|vue/i.test(t)) return 'frontend';
  if (/back[\s-]*end/i.test(t)) return 'backend';
  if (/\bios\b|android|mobile|react\s*native|flutter/i.test(t)) return 'mobile';
  if (/\bqa\b|quality|test\s*(auto|eng)|\bsdet\b/i.test(t)) return 'qa';
  if (/secur|cyber|infosec/i.test(t)) return 'security';
  if (/product\s*manag|program\s*manag|project\s*manag|engineering\s*manag|\bscrum\b/i.test(t)) return 'management';
  if (/\bux\b|ui\s*design|product\s*design/i.test(t)) return 'design';
  if (/software|developer|engineer|programmer|java(?!script)|python|\.net|c#|ruby|php|\bnode\b|spring|golang|\bgo\b/i.test(t)) return 'software-engineering';
  return 'general';
}

function extractSeniority(title: string): string {
  if (/\b(intern|trainee)\b/i.test(title)) return 'intern';
  if (/\bjunior\b|\bjr\b|\bentry\b|\bassociate\b/i.test(title)) return 'junior';
  if (/\bsenior\b|\bsr\b/i.test(title)) return 'senior';
  if (/\bstaff\b/i.test(title)) return 'staff';
  if (/\bprincipal\b/i.test(title)) return 'principal';
  if (/\blead\b|\btech lead\b/i.test(title)) return 'lead';
  if (/\bmanager\b|\bdirector\b|\bvp\b|\bhead of\b/i.test(title)) return 'manager';
  return 'mid';
}

// ── 5. Education Scoring ─────────────────────────────────────────────────────

const DEGREE_RANK: Record<string, number> = {
  phd: 5, doctorate: 5,
  master: 4, masters: 4, mba: 4, ms: 4, ma: 4,
  bachelor: 3, bachelors: 3, bs: 3, ba: 3, btech: 3, be: 3,
  associate: 2, associates: 2, aa: 2, as: 2,
  high_school: 1, diploma: 1, ged: 1,
};

function scoreEducation(
  requirements: JobRequirements,
  candidateEducation: CandidateData['education'],
  candidateCerts: CandidateData['certifications'],
): DimensionScore {
  const reqDegree = requirements.required_education;
  const reqFields = requirements.preferred_education_fields.map(f => f.toLowerCase());
  const reqCerts = requirements.certifications.map(c => c.toLowerCase());

  if (!reqDegree && reqFields.length === 0 && reqCerts.length === 0) {
    return { score: 75, details: 'No education requirements specified' };
  }

  let degreeScore = 0;
  let fieldScore = 0;
  let certScore = 0;

  // Degree level
  if (reqDegree) {
    const reqRank = DEGREE_RANK[reqDegree.toLowerCase()] || 0;
    let bestCandRank = 0;
    for (const edu of candidateEducation) {
      const degreeStr = (edu.degree || '').toLowerCase();
      for (const [key, rank] of Object.entries(DEGREE_RANK)) {
        if (degreeStr.includes(key) && rank > bestCandRank) bestCandRank = rank;
      }
    }
    if (bestCandRank >= reqRank) degreeScore = 100;
    else if (bestCandRank === reqRank - 1) degreeScore = 65;
    else if (bestCandRank > 0) degreeScore = 35;
    else degreeScore = 15;
  } else {
    degreeScore = 75;
  }

  // Field relevance
  if (reqFields.length > 0 && candidateEducation.length > 0) {
    const candFields = candidateEducation.map(e => (e.field || e.degree || '').toLowerCase());
    const fieldMatch = reqFields.some(rf => candFields.some(cf => cf.includes(rf) || rf.includes(cf)));
    fieldScore = fieldMatch ? 100 : 40;
  } else {
    fieldScore = 75;
  }

  // Certifications
  if (reqCerts.length > 0) {
    const candCerts = candidateCerts.map(c => c.name.toLowerCase());
    const certMatched = reqCerts.filter(rc => candCerts.some(cc => cc.includes(rc) || rc.includes(cc))).length;
    certScore = Math.round((certMatched / reqCerts.length) * 100);
  } else {
    certScore = 75;
  }

  const hasReqDegree = !!reqDegree;
  const hasReqCerts = reqCerts.length > 0;
  const weights = { degree: hasReqDegree ? 0.5 : 0.3, field: 0.3, cert: hasReqCerts ? 0.2 : 0.1 };
  const totalW = weights.degree + weights.field + weights.cert;
  const score = Math.round((degreeScore * weights.degree + fieldScore * weights.field + certScore * weights.cert) / totalW);

  const parts: string[] = [];
  if (hasReqDegree) parts.push(`Degree: ${degreeScore >= 65 ? 'meets' : 'below'} ${reqDegree}`);
  if (reqFields.length > 0) parts.push(`Field: ${fieldScore >= 65 ? 'relevant' : 'different'}`);
  if (hasReqCerts) parts.push(`Certs: ${certScore > 0 ? 'partial' : 'missing'}`);

  return { score, details: parts.join(', ') || 'Education evaluated' };
}

// ── 6. Location & Visa Scoring ───────────────────────────────────────────────

function scoreLocation(
  requirements: JobRequirements,
  candidateLocation: string,
  candidateVisa: string,
  openToRemote: boolean,
  openToRelocation: boolean,
  targetLocations: string[],
): DimensionScore {
  const jobLocType = requirements.location_type;
  const jobCity = (requirements.location_city || '').toLowerCase();
  const candLocation = (candidateLocation || '').toLowerCase();
  const candTargets = targetLocations.map(l => l.toLowerCase());

  // Remote job
  if (jobLocType === 'remote') {
    if (openToRemote) return { score: 100, details: 'Remote job, candidate open to remote' };
    return { score: 80, details: 'Remote job available' };
  }

  // Location matching for hybrid/onsite
  if (jobCity) {
    const cityMatch = candLocation.includes(jobCity) || jobCity.includes(candLocation) ||
      candTargets.some(t => t.includes(jobCity) || jobCity.includes(t));

    if (cityMatch) {
      return { score: 100, details: `Location match: ${jobCity}` };
    }

    if (openToRelocation) {
      return { score: 70, details: `Different city but open to relocation` };
    }

    if (jobLocType === 'hybrid') {
      return { score: 50, details: `Hybrid in ${jobCity}, candidate in ${candidateLocation || 'unknown'}` };
    }

    return { score: 30, details: `Onsite in ${jobCity}, candidate in ${candidateLocation || 'unknown'}, not open to relocation` };
  }

  // Visa/work authorization
  let visaPenalty = 0;
  const visa = (candidateVisa || '').toLowerCase();
  if (requirements.visa_sponsorship === false) {
    if (visa.includes('h1b') || visa.includes('opt') || visa.includes('visa') || visa.includes('sponsorship')) {
      visaPenalty = 40;
    }
  }

  return { score: Math.max(20, 75 - visaPenalty), details: visaPenalty > 0 ? 'Visa sponsorship not offered' : 'Location compatible' };
}

// ── 7. AI Soft Factor Evaluation ─────────────────────────────────────────────

async function scoreSoftFactors(
  jobTitle: string,
  jobDescription: string,
  candidateTitle: string,
  resumeText: string,
  keywordResult: DimensionScore,
): Promise<DimensionScore> {
  if (!ANTHROPIC_API_KEY) return { score: 50, details: 'AI unavailable' };

  const prompt = `You are a senior recruiter evaluating candidate-job soft fit. Score 0-100 on these factors:
- Career trajectory: Is the candidate growing toward this role?
- Industry relevance: Has the candidate worked in similar industries/domains?
- Impact signals: Does the resume show measurable achievements (metrics, scale, outcomes)?
- Communication: Is the resume well-written and clear?
- Growth potential: Could this candidate grow into the role even if not a perfect fit today?

The candidate matched ${keywordResult.matched?.length || 0} required keywords and is missing ${keywordResult.missing?.length || 0}.

JOB: ${jobTitle}
JD EXCERPT: ${jobDescription.slice(0, 800)}

CANDIDATE TITLE: ${candidateTitle}
RESUME EXCERPT: ${resumeText.slice(0, 1500)}

Return ONLY valid JSON: { "score": <0-100>, "details": "<1 sentence explanation>" }`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return { score: 50, details: 'AI evaluation unavailable' };
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { score: 50, details: 'Parse error' };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(100, parseInt(String(parsed.score), 10) || 50)),
      details: parsed.details || 'Evaluated',
    };
  } catch {
    return { score: 50, details: 'AI evaluation failed' };
  }
}

// ── Main Scoring Function ────────────────────────────────────────────────────

export async function computeATSScore(
  jobTitle: string,
  jobDescription: string,
  requirements: JobRequirements,
  candidate: CandidateData,
): Promise<ATSScoreResult> {

  // Dimension 1: Keyword matching (deterministic)
  const keyword = scoreKeywords(
    requirements,
    candidate.skills,
    candidate.tools || [],
    candidate.resume_text,
  );

  // Dimension 2: Experience (deterministic)
  const experience = scoreExperience(
    requirements,
    candidate.years_of_experience ?? null,
    candidate.experience,
  );

  // Dimension 3: Title alignment (deterministic)
  const title = scoreTitle(
    requirements,
    jobTitle,
    candidate.primary_title || '',
    candidate.secondary_titles || [],
  );

  // Dimension 4: Education (deterministic)
  const education = scoreEducation(
    requirements,
    candidate.education,
    candidate.certifications,
  );

  // Dimension 5: Location & visa (deterministic)
  const location = scoreLocation(
    requirements,
    candidate.location || '',
    candidate.visa_status || '',
    candidate.open_to_remote ?? true,
    candidate.open_to_relocation ?? false,
    candidate.target_locations || [],
  );

  // Dimension 6: Soft factors (AI)
  const soft = await scoreSoftFactors(
    jobTitle,
    jobDescription,
    candidate.primary_title || '',
    candidate.resume_text,
    keyword,
  );

  // Weighted total
  const raw = Math.round(
    keyword.score * W.keyword +
    experience.score * W.experience +
    title.score * W.title +
    education.score * W.education +
    location.score * W.location +
    soft.score * W.soft
  );

  // Domain mismatch hard penalty: if title score is very low (cross-domain), cap total
  let total_score = raw;
  if (title.score <= 25) {
    total_score = Math.min(total_score, 30);
  } else if (title.score <= 45) {
    total_score = Math.min(total_score, 55);
  }

  total_score = Math.max(0, Math.min(100, total_score));

  // Build reason
  const dims = { keyword, experience, title, education, location, soft };
  const strongest = Object.entries(dims).sort(([, a], [, b]) => b.score - a.score)[0];
  const weakest = Object.entries(dims).sort(([, a], [, b]) => a.score - b.score)[0];
  const reason = total_score >= 82
    ? `Strong match — ${strongest[1].details}`
    : total_score >= 75
    ? `Moderate match — strongest: ${strongest[0]} (${strongest[1].score}), gap: ${weakest[0]} (${weakest[1].score})`
    : total_score >= 50
    ? `Below threshold — weakest area: ${weakest[0]} (${weakest[1].details})`
    : `Poor fit — ${weakest[0]}: ${weakest[1].details}`;

  return {
    total_score,
    dimensions: { keyword, experience, title, education, location, soft },
    reason,
    matched_keywords: keyword.matched || [],
    missing_keywords: keyword.missing || [],
  };
}
