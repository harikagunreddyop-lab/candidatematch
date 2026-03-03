/**
 * Elite Multi-Dimensional ATS Scoring Engine v4
 *
 * Evidence-grounded deterministic scoring (no AI for score numbers).
 * Claude used only for: JD extraction, bullet rewrite suggestions, recruiter summary,
 * interview kit, missing-skill explanation — never for score decisions.
 *
 * Non-negotiable rules:
 * - Skills only count fully when evidenced in bullets/projects; skills-list-only capped
 * - Must-have skills are gates; missing = rank-ineligible unless recruiter override
 * - Responsibility matching: semantic + grounded
 * - Top-N bullets only for impact (stops resume bloat gaming)
 * - Score + Confidence separate
 */

import { error as logError } from '@/lib/logger';
import { computeATSScoreV2, type ScorerInput, type ScorerOutput } from '@/lib/ats-scorer-v2';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

// ── Types ────────────────────────────────────────────────────────────────────

export interface JobRequirements {
  must_have_skills: string[];
  nice_to_have_skills: string[];
  implicit_skills: string[];
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
  industry_vertical: string | null;
  behavioral_keywords: string[];
  context_phrases: string[];
  /** Core duties in 3–5 bullets for responsibility↔resume semantic alignment */
  responsibilities: string[];
}

export interface EvidenceSpan {
  skill: string;
  resume_snippet: string;
  requirement_source?: 'must_have' | 'nice_to_have' | 'implicit';
}

export interface DimensionScore {
  score: number;
  details: string;
  matched?: string[];
  missing?: string[];
  /** Impact metric examples from resume bullets (for behavioral dimension) */
  impact_examples?: Array<{ snippet: string; type: string }>;
  /** Evidence spans linking matched skills to resume snippets (for keyword dimension) */
  evidence_spans?: EvidenceSpan[];
}

export interface ATSScoreResult {
  total_score: number;
  confidence: number;
  band: 'elite' | 'strong' | 'possible' | 'weak';
  dimensions: Record<string, DimensionScore>;
  reason: string;
  matched_keywords: string[];
  missing_keywords: string[];
  gate_passed: boolean;
  gate_reason: string;
  negative_signals?: Array<{ type: string; severity: string; detail: string }>;
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

// ═════════════════════════════════════════════════════════════════════════════
// JD REQUIREMENT EXTRACTION (AI — cached per job)
// ═════════════════════════════════════════════════════════════════════════════

export async function extractJobRequirements(
  jobTitle: string,
  jobDescription: string,
  jobLocation?: string,
): Promise<JobRequirements | null> {
  if (!ANTHROPIC_API_KEY || !jobDescription) return null;

  const prompt = `You are an expert technical recruiter and ATS system. Extract ALL structured requirements from this job description with extreme precision.

JOB TITLE: ${jobTitle}
LOCATION: ${jobLocation || 'Not specified'}

JOB DESCRIPTION:
${jobDescription.slice(0, 3500)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "must_have_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill1", "skill2"],
  "implicit_skills": ["skill1", "skill2"],
  "min_years_experience": <number or null>,
  "preferred_years_experience": <number or null>,
  "seniority_level": "<intern|junior|mid|senior|staff|principal|lead|manager|director|null>",
  "required_education": "<high_school|associate|bachelor|master|phd|null>",
  "preferred_education_fields": ["field1", "field2"],
  "certifications": ["cert1"],
  "location_type": "<remote|hybrid|onsite|null>",
  "location_city": "<city, state or null>",
  "visa_sponsorship": <true|false|null>,
  "domain": "<software-engineering|frontend|backend|fullstack|data-engineering|data-science|devops|mobile|qa|security|management|design|general>",
  "industry_vertical": "<fintech|healthtech|ecommerce|saas|adtech|edtech|gaming|cybersecurity|ai_ml|cloud|media|logistics|null>",
  "behavioral_keywords": ["keyword1", "keyword2"],
  "context_phrases": ["phrase that implies technical capability"],
  "responsibilities": ["Core duty 1", "Core duty 2", "Core duty 3"]
}

Extraction rules:
- must_have_skills: Explicitly required technologies/tools/frameworks (lowercase, specific)
- nice_to_have_skills: "preferred", "bonus", "plus", "familiarity with" (lowercase)
- implicit_skills: Skills implied by the role but not explicitly listed. E.g. a "Senior React Developer" role implies JavaScript, HTML, CSS, git even if not listed. A "Data Pipeline Engineer" implies SQL, Python, ETL even if not listed.
- behavioral_keywords: Action verbs or traits the JD emphasizes (e.g., "collaborative", "self-starter", "mentoring")
- context_phrases: Technical phrases that indicate capability areas (e.g., "build scalable distributed systems", "design RESTful APIs", "manage cloud infrastructure")
- responsibilities: 3–5 core job duties as action-oriented bullets (e.g., "Build and maintain REST APIs", "Deploy microservices to AWS", "Collaborate with product on requirements")
- Infer seniority from title + years if not explicit
- Return null for truly undeterminable fields`;

  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeoutMs = Number(process.env.ANTHROPIC_TIMEOUT_MS || 25000);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
        });
      } catch (e) {
        // Retry on transient network/timeout issues.
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
          continue;
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
      if (res.status === 429 || res.status === 529) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
        continue;
      }
      break;
    }
    if (!res || !res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      must_have_skills: parsed.must_have_skills || [],
      nice_to_have_skills: parsed.nice_to_have_skills || [],
      implicit_skills: parsed.implicit_skills || [],
      min_years_experience: parsed.min_years_experience ?? null,
      preferred_years_experience: parsed.preferred_years_experience ?? null,
      seniority_level: parsed.seniority_level || null,
      required_education: parsed.required_education || null,
      preferred_education_fields: parsed.preferred_education_fields || [],
      certifications: parsed.certifications || [],
      location_type: parsed.location_type || null,
      location_city: parsed.location_city || null,
      visa_sponsorship: parsed.visa_sponsorship ?? null,
      domain: parsed.domain || 'general',
      industry_vertical: parsed.industry_vertical || null,
      behavioral_keywords: parsed.behavioral_keywords || [],
      context_phrases: parsed.context_phrases || [],
      responsibilities: parsed.responsibilities || [],
    } as JobRequirements;
  } catch (e) {
    logError('[ats-engine] JD extraction failed', e);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: COMPUTE FULL ATS SCORE (v4 — evidence-grounded, deterministic)
// ═════════════════════════════════════════════════════════════════════════════

export async function computeATSScore(
  _jobTitle: string,
  _jobDescription: string,
  requirements: JobRequirements,
  candidate: CandidateData,
  options?: { bulletsResponsibilitiesSim?: number | null },
): Promise<ATSScoreResult> {
  const input: ScorerInput = {
    requirements,
    candidateSkills: candidate.skills,
    candidateTools: candidate.tools || [],
    resumeText: candidate.resume_text,
    experience: candidate.experience,
    education: candidate.education || [],
    certifications: candidate.certifications || [],
    location: candidate.location,
    visa_status: candidate.visa_status,
    years_of_experience: candidate.years_of_experience,
    open_to_remote: candidate.open_to_remote,
    open_to_relocation: candidate.open_to_relocation,
    target_locations: candidate.target_locations,
    primary_title: candidate.primary_title,
    secondary_titles: candidate.secondary_titles,
  };

  const out: ScorerOutput = computeATSScoreV2(input, {
    bulletsResponsibilitiesSim: options?.bulletsResponsibilitiesSim ?? null,
  });

  const dims: Record<string, DimensionScore> = {
    parse:  { score: out.components.parse,  details: 'Resume parseability (sections, dates, bullets, contact)' },
    must:   { score: out.components.must,   details: `${out.matched_must.length}/${(requirements.must_have_skills || []).length} must-have skills met`, matched: out.matched_must, missing: out.missing_must, evidence_spans: out.evidence_spans },
    nice:   { score: out.components.nice,   details: 'Nice-to-have skills' },
    resp:   { score: out.components.resp,   details: 'JD responsibility ↔ resume semantic alignment' },
    impact: { score: out.components.impact, details: 'STAR + quantified metrics (top bullets)' },
    scope:  { score: out.components.scope,  details: 'Years + leadership + scale' },
    recent: { score: out.components.recent, details: 'Recency of must/nice skills' },
    domain: { score: out.components.domain, details: 'Role/domain alignment' },
    risk:   { score: out.components.risk,   details: 'Job hop, gaps, overlaps' },
  };

  const reason = out.total_score >= 90
    ? `Elite — ${out.gate_reason}`
    : out.total_score >= 80
    ? `Strong — ${out.gate_reason}`
    : out.total_score >= 70
    ? `Possible — ${out.gate_reason}`
    : `Weak — ${out.gate_reason}`;

  return {
    total_score: out.total_score,
    confidence: out.confidence,
    band: out.band,
    dimensions: dims,
    negative_signals: out.negative_signals,
    reason,
    matched_keywords: out.matched_must,
    missing_keywords: out.missing_must,
    gate_passed: out.gate_passed,
    gate_reason: out.gate_reason,
  };
}
