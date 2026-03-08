/**
 * LLM-based STAR bullet and summary generation for resumes.
 * Used by both index.js and fast-generator.js.
 */

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function generateBullets(candidate, job) {
  if (!ANTHROPIC_KEY) {
    return { summary: candidate.summary || candidate.default_pitch || '', experience: [] };
  }
  const expYears = candidate.years_of_experience ?? 5;
  const maxRoles = expYears <= 5 ? 3 : 5;
  const maxBulletsRecent = expYears <= 5 ? 4 : 6;
  const maxBulletsOlder = expYears <= 5 ? 3 : 4;

  const jd = (job.jd_clean || job.jd_raw || job.description || '').slice(0, 4000);

  const prompt = `You are an elite ATS resume writer. Your job is to ANALYZE the job description and TAILOR the resume so it scores 95+ on ATS systems (Workday, Taleo, Greenhouse, Lever, etc.).

GOAL: Produce content that will score 95+ on ATS. Extract and mirror job keywords, ensure 8-12% keyword density, use exact role titles and skill phrases from the JD where truthful.

CANDIDATE:
Name: ${candidate.full_name}
Title: ${candidate.primary_title}
Years experience: ${expYears}
Skills: ${JSON.stringify(candidate.skills || [])}
Tools: ${JSON.stringify(candidate.tools || [])}

EXPERIENCE:
${JSON.stringify(candidate.experience || [], null, 2)}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Description:
${jd}

ANALYZE THE JD: Extract must-have skills, technologies, role keywords. Weave these NATURALLY into the summary and bullets. Keyword density 8-12% for 95+ ATS score.

ELITE STAR BULLET RULES (MANDATORY):
- Formula: Action Verb + Scope + Method + Measurable Outcome
- Each bullet: 18-32 words, at least one number
- Use elite verbs: Architected, Engineered, Orchestrated, Automated, Optimized, Accelerated, Reduced, Increased, Implemented, Delivered, Led, Directed, Rebuilt, Transformed
- FORBIDDEN: "responsible for", "assisted with", "helped", "various", "several", "dynamic", "hardworking", "passionate"
- Recent roles: ${maxBulletsRecent} bullets. Older roles: ${maxBulletsOlder} bullets. Max ${maxRoles} roles.
- DO NOT invent facts. Only rewrite existing responsibilities with quantifiable impact.
- Embed JD keywords naturally (8-12% density) for 95+ ATS score.

PROFESSIONAL SUMMARY (3-5 lines, single paragraph):
- Start with target role title from the JD. Include 2 quantified achievements, domain, core tools. Use JD terminology. No filler adjectives.

OUTPUT FORMAT (return ONLY this JSON, no markdown):
{"summary":"...","experience":[{"company":"...","title":"...","bullets":["...","..."]}]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';

  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.experience)) {
      return { summary: parsed.summary || '', experience: parsed.experience };
    }
    if (Array.isArray(parsed)) return { summary: '', experience: parsed };
    return { summary: '', experience: [] };
  } catch {
    const objMatch = text.match(/\{[\s\S]*\}/);
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (objMatch) {
      try {
        const p = JSON.parse(objMatch[0]);
        return { summary: p.summary || '', experience: Array.isArray(p.experience) ? p.experience : [] };
      } catch (_) {}
    }
    if (arrMatch) return { summary: '', experience: JSON.parse(arrMatch[0]) };
    return { summary: '', experience: [] };
  }
}

module.exports = { generateBullets };
