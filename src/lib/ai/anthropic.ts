/**
 * Shared Anthropic API client for elite AI features.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
export const CLAUDE_FAST = 'claude-haiku-4-5-20251001';

export async function callClaude(
  prompt: string,
  options?: { model?: string; maxTokens?: number; system?: string }
): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const model = options?.model ?? CLAUDE_FAST;
  const maxTokens = options?.maxTokens ?? 2000;
  const system = options?.system;

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.ANTHROPIC_TIMEOUT_MS || 30000));
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
          model,
          max_tokens: maxTokens,
          ...(system && { system }),
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      clearTimeout(timeout);
      if (res.status === 429 || res.status === 529) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content?.[0]?.text || '';
    } catch (e) {
      clearTimeout(timeout);
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
      else throw e;
    }
  }
  throw new Error('Claude API failed after retries');
}
