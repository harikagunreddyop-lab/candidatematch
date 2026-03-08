/**
 * Parse job application emails with Claude to extract structured status.
 */

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

export interface JobEmailParseResult {
  isJobEmail: boolean;
  company?: string;
  jobTitle?: string;
  status?: string;
  nextSteps?: string;
  interviewDate?: string;
  confidence: number;
}

const STATUS_MAP: Record<string, string> = {
  applied: 'applied',
  screening: 'screening',
  interview: 'interview',
  interview_scheduled: 'interview',
  offer: 'offer',
  rejected: 'rejected',
  ready: 'ready',
};

/** Map parser status to applications.status enum. */
export function mapToApplicationStatus(status: string | undefined): string | null {
  if (!status) return null;
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_MAP[normalized] ?? (['applied', 'screening', 'interview', 'offer', 'rejected'].includes(normalized) ? normalized : null);
}

export class EmailParser {
  async parseJobEmail(email: { subject: string; body: string; from: string }): Promise<JobEmailParseResult> {
    if (!ANTHROPIC_KEY) {
      return { isJobEmail: false, confidence: 0 };
    }

    const body = (email.body || '').slice(0, 8000);
    const prompt = `Parse this job application email and extract structured data:

SUBJECT: ${email.subject}
FROM: ${email.from}
BODY:
${body}

Determine:
1. Is this a job application confirmation/update? (yes/no)
2. Company name (if identifiable)
3. Job title (if mentioned)
4. Application status: one of applied, screening, interview, offer, rejected
5. Next steps (if any)
6. Interview date (ISO 8601 if mentioned)

Return JSON only, no markdown:
{
  "isJobEmail": true,
  "company": "Acme Corp",
  "jobTitle": "Senior Software Engineer",
  "status": "interview",
  "nextSteps": "Technical interview scheduled",
  "interviewDate": "2026-03-15T14:00:00Z",
  "confidence": 0.95
}

If not a job application email set isJobEmail to false and confidence to a value 0-1.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) return { isJobEmail: false, confidence: 0 };
      const data = await res.json();
      const text = (data.content?.[0]?.text || '{}').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      return {
        isJobEmail: !!parsed.isJobEmail,
        company: parsed.company,
        jobTitle: parsed.jobTitle,
        status: parsed.status,
        nextSteps: parsed.nextSteps,
        interviewDate: parsed.interviewDate,
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      };
    } catch {
      return { isJobEmail: false, confidence: 0 };
    }
  }
}
