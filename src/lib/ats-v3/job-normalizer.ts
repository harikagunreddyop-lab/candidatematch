import {
  CanonicalJobProfile,
  RequirementClass,
  RoleFamily,
  TypedRequirement,
} from './types';
import { classifyJobFamily } from './role-family-classifier';
import { normalize, countOccurrences } from './utils/text';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

type RawExtraction = {
  fatal_must?: string[] | null;
  critical_must?: string[] | null;
  standard_must?: string[] | null;
  preferred?: string[] | null;
  bonus?: string[] | null;
  min_years_experience?: number | null;
  preferred_years_experience?: number | null;
  seniority_level?:
    | 'intern'
    | 'junior'
    | 'mid'
    | 'senior'
    | 'staff'
    | 'principal'
    | 'lead'
    | 'manager'
    | 'director'
    | null;
  required_education?: 'high_school' | 'associate' | 'bachelor' | 'master' | 'phd' | null;
  required_certifications?: string[] | null;
  location_type?: 'remote' | 'hybrid' | 'onsite' | null;
  work_auth_required?: boolean | null;
  domain_tags?: string[] | null;
  industry_vertical?: string | null;
  responsibilities?: string[] | null;
};

const MAX_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 500;
const REQUEST_TIMEOUT_MS = 12000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPrompt(
  title: string,
  description: string,
  location?: string,
): string {
  const locationLine = location ? `Location: ${location}\n` : '';

  return [
    'You are an expert ATS and job description analyst.',
    'Extract a STRICT JSON object capturing the structured requirements of this job.',
    '',
    'Follow these classification rules for requirements:',
    '- fatal_must: ONLY items where missing = immediate disqualification (active license, clearance, mandatory on-site, work auth if explicitly stated as non-negotiable).',
    '- critical_must: Primary technical or domain requirements without which the role cannot be performed (core stack for engineering, direct domain experience for specialist roles).',
    '- standard_must: Supporting requirements, common tools, methodologies — important but not individually disqualifying.',
    '- preferred: Explicitly marked as preferred/bonus/nice-to-have in the JD.',
    '- bonus: Minor additions that provide slight advantage.',
    '',
    'Return JSON with this exact shape (no extra keys, no comments, no explanation):',
    JSON.stringify(
      {
        fatal_must: ['requirement exactly as written'],
        critical_must: ['requirement exactly as written'],
        standard_must: ['requirement'],
        preferred: ['requirement'],
        bonus: ['requirement'],
        min_years_experience: null,
        preferred_years_experience: null,
        seniority_level: null,
        required_education: null,
        required_certifications: ['cert name'],
        location_type: null,
        work_auth_required: null,
        domain_tags: ['domain1', 'domain2'],
        industry_vertical: null,
        responsibilities: ['Core duty 1', 'Core duty 2', 'Core duty 3'],
      },
      null,
      2,
    ),
    '',
    'Job posting:',
    `Title: ${title}`,
    locationLine,
    'Description:',
    description,
  ].join('\n');
}

async function callClaudeForJobExtraction(
  jobId: string,
  title: string,
  description: string,
  location?: string,
): Promise<RawExtraction | null> {
  if (!ANTHROPIC_API_KEY) {
    console.error('normalizeJob: ANTHROPIC_API_KEY is not set; skipping extraction.');
    return null;
  }

  const url = 'https://api.anthropic.com/v1/messages';
  const prompt = buildPrompt(title, description, location);

  let attempt = 0;
  let backoff = INITIAL_BACKOFF_MS;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      clearTimeout(timeout);

      if (res.status === 429 || res.status === 529) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoff);
          backoff *= 2;
          continue;
        }
      }

      if (!res.ok) {
        console.error(
          `normalizeJob: Anthropic request failed for job ${jobId} with status ${res.status}`,
        );
        return null;
      }

      const json = (await res.json()) as any;
      const content = Array.isArray(json?.content) ? json.content : [];
      const textPart = content.find((c: any) => c?.type === 'text');
      const text = typeof textPart?.text === 'string' ? textPart.text : '';
      if (!text) {
        console.error('normalizeJob: Empty content from Claude for job', jobId);
        return null;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        console.error('normalizeJob: Failed to parse Claude JSON for job', jobId, err);
        return null;
      }

      return sanitizeExtraction(parsed);
    } catch (err: any) {
      clearTimeout(timeout);
      const isAbort = err?.name === 'AbortError';
      if (isAbort) {
        console.warn(`normalizeJob: Anthropic request timeout for job ${jobId}`);
      } else {
        console.error('normalizeJob: Anthropic request error for job', jobId, err);
      }

      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoff);
        backoff *= 2;
        continue;
      }

      return null;
    }
  }

  return null;
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
}

function toNumberOrNull(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sanitizeExtraction(raw: any): RawExtraction {
  const obj = typeof raw === 'object' && raw !== null ? raw : {};

  const seniority = (obj.seniority_level ?? null) as RawExtraction['seniority_level'];
  const validSeniorities: RawExtraction['seniority_level'][] = [
    'intern',
    'junior',
    'mid',
    'senior',
    'staff',
    'principal',
    'lead',
    'manager',
    'director',
    null,
  ];

  const requiredEducation =
    (obj.required_education ?? null) as RawExtraction['required_education'];
  const validEducation: RawExtraction['required_education'][] = [
    'high_school',
    'associate',
    'bachelor',
    'master',
    'phd',
    null,
  ];

  const locationType =
    (obj.location_type ?? null) as RawExtraction['location_type'];
  const validLocationTypes: RawExtraction['location_type'][] = [
    'remote',
    'hybrid',
    'onsite',
    null,
  ];

  const clean: RawExtraction = {
    fatal_must: toStringArray(obj.fatal_must),
    critical_must: toStringArray(obj.critical_must),
    standard_must: toStringArray(obj.standard_must),
    preferred: toStringArray(obj.preferred),
    bonus: toStringArray(obj.bonus),
    min_years_experience: toNumberOrNull(obj.min_years_experience),
    preferred_years_experience: toNumberOrNull(obj.preferred_years_experience),
    seniority_level: validSeniorities.includes(seniority) ? seniority : null,
    required_education: validEducation.includes(requiredEducation)
      ? requiredEducation
      : null,
    required_certifications: toStringArray(obj.required_certifications),
    location_type: validLocationTypes.includes(locationType)
      ? locationType
      : null,
    work_auth_required:
      typeof obj.work_auth_required === 'boolean'
        ? obj.work_auth_required
        : null,
    domain_tags: toStringArray(obj.domain_tags),
    industry_vertical:
      typeof obj.industry_vertical === 'string'
        ? obj.industry_vertical.trim() || null
        : null,
    responsibilities: toStringArray(obj.responsibilities),
  };

  return clean;
}

interface RequirementBuildContext {
  className: RequirementClass;
  terms: string[];
  sectionHint: 'requirements' | 'preferred';
}

function buildTypedRequirements(
  ctxs: RequirementBuildContext[],
  title: string,
  description: string,
  responsibilities: string[],
): TypedRequirement[] {
  const fullText = `${title}\n\n${description}`;
  const normalizedTitle = normalize(title);
  const normalizedFull = normalize(fullText);
  const normalizedResponsibilities = responsibilities.map((r) => normalize(r));

  const results: TypedRequirement[] = [];

  for (const ctx of ctxs) {
    const byClass: {
      req: TypedRequirement;
      rawScore: number;
    }[] = [];

    for (const term of ctx.terms) {
      const trimmed = term.trim();
      if (!trimmed) continue;

      const normalizedTerm = normalize(trimmed);

      const frequency_in_jd = countOccurrences(normalizedFull, trimmed);

      let section_source: TypedRequirement['section_source'] = ctx.sectionHint;
      const inTitle = normalizedTitle.includes(normalizedTerm);
      const inResponsibilities = normalizedResponsibilities.some((r) =>
        r.includes(normalizedTerm),
      );

      if (inTitle) {
        section_source = 'title';
      } else if (inResponsibilities) {
        section_source = 'responsibilities';
      }

      const positionWeight =
        section_source === 'title'
          ? 3
          : section_source === 'requirements'
          ? 2
          : section_source === 'responsibilities'
          ? 1.5
          : section_source === 'preferred'
          ? 1
          : 1;

      const rawScore =
        (frequency_in_jd > 0 ? frequency_in_jd : 1) * positionWeight;

      byClass.push({
        req: {
          term: trimmed,
          class: ctx.className,
          normalized: normalizedTerm,
          weight: 0, // filled after normalization
          section_source,
          frequency_in_jd,
        },
        rawScore,
      });
    }

    if (byClass.length === 0) continue;

    const maxScore = byClass.reduce(
      (max, item) => (item.rawScore > max ? item.rawScore : max),
      0,
    );

    for (const item of byClass) {
      const weight =
        maxScore > 0 ? Math.min(1, item.rawScore / maxScore) : 1;
      item.req.weight = Number(weight.toFixed(3));
      results.push(item.req);
    }
  }

  return results;
}

export async function normalizeJob(
  jobId: string,
  title: string,
  description: string,
  location?: string,
): Promise<CanonicalJobProfile | null> {
  const extraction = await callClaudeForJobExtraction(
    jobId,
    title,
    description,
    location,
  );

  if (!extraction) {
    return null;
  }

  const responsibilities = extraction.responsibilities ?? [];

  const requirements: TypedRequirement[] = buildTypedRequirements(
    [
      {
        className: 'fatal_must',
        terms: extraction.fatal_must ?? [],
        sectionHint: 'requirements',
      },
      {
        className: 'critical_must',
        terms: extraction.critical_must ?? [],
        sectionHint: 'requirements',
      },
      {
        className: 'standard_must',
        terms: extraction.standard_must ?? [],
        sectionHint: 'requirements',
      },
      {
        className: 'preferred',
        terms: extraction.preferred ?? [],
        sectionHint: 'preferred',
      },
      {
        className: 'bonus',
        terms: extraction.bonus ?? [],
        sectionHint: 'preferred',
      },
    ],
    title,
    description,
    responsibilities,
  );

  const classification = classifyJobFamily(title, description);

  const family: RoleFamily = classification.family;
  const family_confidence = classification.confidence;

  const profile: CanonicalJobProfile = {
    job_id: jobId,
    title,
    // Classification
    family,
    family_confidence,
    seniority: extraction.seniority_level ?? null,
    domain_tags: extraction.domain_tags ?? [],
    industry_vertical: extraction.industry_vertical ?? null,
    // Typed requirements
    requirements,
    responsibilities,
    // Constraints
    min_years: extraction.min_years_experience ?? null,
    preferred_years: extraction.preferred_years_experience ?? null,
    required_education: extraction.required_education ?? null,
    required_certifications: extraction.required_certifications ?? [],
    location_type: extraction.location_type ?? null,
    work_auth_required: extraction.work_auth_required === true,
    // Raw
    raw_description: description,
    extracted_at: new Date().toISOString(),
    model_used: CLAUDE_MODEL,
  };

  return profile;
}


