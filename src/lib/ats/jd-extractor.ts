import type { JobRequirements } from './types';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

export async function extractJobRequirements(
  jobTitle: string,
  jobDescription: string,
  jobLocation?: string,
): Promise<JobRequirements | null> {
  if (!ANTHROPIC_API_KEY || !jobDescription?.trim()) return null;

  const prompt = `You are a precise ATS requirement extractor. Extract all structured requirements from this job description.

JOB TITLE: ${jobTitle}
LOCATION: ${jobLocation ?? 'Not specified'}

JOB DESCRIPTION:
${jobDescription.slice(0, 4000)}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "must_have_skills": ["exact skill as written in JD"],
  "nice_to_have_skills": ["preferred/bonus skills"],
  "implicit_skills": ["skills implied by role not stated, e.g. JS for React role"],
  "min_years_experience": <number or null>,
  "preferred_years_experience": <number or null>,
  "seniority_level": "<intern|junior|mid|senior|staff|principal|lead|manager|director|null>",
  "required_education": "<high_school|associate|bachelor|master|phd|null>",
  "certifications": ["cert name"],
  "domain": "<software-engineering|frontend|backend|fullstack|data-engineering|data-science|devops|mobile|qa|security|management|design|general>",
  "responsibilities": ["Core duty 1 as action bullet", "Core duty 2", "Core duty 3"],
  "weighted_keywords": [
    {"term": "exact keyword", "weight": 3, "section": "title"},
    {"term": "keyword", "weight": 2, "section": "requirements"},
    {"term": "keyword", "weight": 1, "section": "preferred"}
  ]
}

Rules:
- must_have_skills: Only explicitly required. Use EXACT casing/spelling from JD. Critical — Taleo matches literally.
- weighted_keywords: weight 3 = in job title or repeated 3+ times; weight 2 = in requirements section; weight 1 = in preferred/nice-to-have. Include ALL meaningful non-stop-word terms.
- Include both spelled-out forms AND abbreviations as separate keywords when both appear (e.g. "Project Management Professional" AND "PMP").
- responsibilities: 3-5 action-verb bullets capturing core duties.
- implicit_skills: Be conservative — only add skills that ANY recruiter would assume from the role title.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      clearTimeout(timeout);

      if (res.status === 429 || res.status === 529) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
        continue;
      }
      if (!res.ok) return null;

      const data = await res.json();
      const text: string = data.content?.[0]?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const p = JSON.parse(match[0]);
      return {
        must_have_skills: p.must_have_skills ?? [],
        nice_to_have_skills: p.nice_to_have_skills ?? [],
        implicit_skills: p.implicit_skills ?? [],
        min_years_experience: p.min_years_experience ?? null,
        preferred_years_experience: p.preferred_years_experience ?? null,
        seniority_level: p.seniority_level ?? null,
        required_education: p.required_education ?? null,
        certifications: p.certifications ?? [],
        domain: p.domain ?? 'general',
        responsibilities: p.responsibilities ?? [],
        weighted_keywords: p.weighted_keywords ?? [],
      } satisfies JobRequirements;
    } catch {
      clearTimeout(timeout);
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
    }
  }
  return null;
}

