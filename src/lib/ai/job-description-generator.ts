/**
 * AI Job Description Generator — uses Claude to generate ATS-optimized, inclusive JDs.
 */
import { callClaude, CLAUDE_MODEL } from './anthropic';

export interface JobDescriptionRequest {
  job_title: string;
  department?: string;
  seniority_level: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  key_responsibilities?: string[];
  required_skills?: string[];
  company_description?: string;
  benefits?: string[];
  work_location: 'remote' | 'hybrid' | 'onsite';
  tone?: 'formal' | 'casual' | 'innovative';
}

export interface GeneratedJobDescription {
  opening_paragraph: string;
  about_the_role: string;
  what_you_do: string[];
  what_you_bring: string[];
  nice_to_have: string[];
  benefits_section: string;
  about_us: string;
  full_text: string;
}

export async function generateJobDescription(
  request: JobDescriptionRequest
): Promise<GeneratedJobDescription> {
  const skills = (request.required_skills ?? []).join(', ') || 'Not specified';
  const responsibilities = (request.key_responsibilities ?? []).join('\n- ') || 'General role responsibilities';
  const benefits = (request.benefits ?? []).join(', ') || 'Competitive benefits';

  const prompt = `Generate a compelling, ATS-optimized job description as JSON.

Title: ${request.job_title}
${request.department ? `Department: ${request.department}` : ''}
Level: ${request.seniority_level}
Location: ${request.work_location}
Company: ${request.company_description || 'Our company'}
Tone: ${request.tone || 'professional but approachable'}

Required skills to incorporate naturally: ${skills}

Key responsibilities (use as basis for bullets): ${responsibilities}

Benefits: ${benefits}

Requirements:
- Use inclusive language (avoid gender-coded words like "rockstar", "ninja", "aggressive")
- ATS-friendly formatting, clear headings
- Return ONLY a valid JSON object with these exact keys (all strings; what_you_do and what_you_bring and nice_to_have are arrays of strings):
  opening_paragraph, about_the_role, what_you_do (array, 5-7 bullets), what_you_bring (array), nice_to_have (array), benefits_section, about_us, full_text (single string with the complete JD combining all sections with clear line breaks)
- full_text should be the complete job description as one string, with sections separated by \\n\\n and bullets as \\n- 
- No markdown, no code fences, only the JSON object.`;

  const text = await callClaude(prompt, { maxTokens: 4000, model: CLAUDE_MODEL });
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Invalid response from AI');
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

  return {
    opening_paragraph: String(parsed.opening_paragraph ?? ''),
    about_the_role: String(parsed.about_the_role ?? ''),
    what_you_do: arr(parsed.what_you_do),
    what_you_bring: arr(parsed.what_you_bring),
    nice_to_have: arr(parsed.nice_to_have),
    benefits_section: String(parsed.benefits_section ?? ''),
    about_us: String(parsed.about_us ?? ''),
    full_text: String(parsed.full_text ?? ''),
  };
}
