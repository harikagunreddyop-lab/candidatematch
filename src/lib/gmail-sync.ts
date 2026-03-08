/**
 * Gmail sync — fetch recent messages and match to candidates/applications.
 */

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: GmailMessageHeader[];
    mimeType?: string;
  };
}

export interface ParsedEmail {
  gmail_message_id: string;
  gmail_thread_id: string;
  from_email: string;
  to_emails: string[];
  subject: string;
  snippet: string;
  received_at: string;
}

function getHeader(headers: GmailMessageHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function parseEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : value.trim().toLowerCase();
}

export function parseGmailMessage(msg: GmailMessage): ParsedEmail {
  const headers = msg.payload?.headers || [];
  const from = getHeader(headers, 'From');
  const to = getHeader(headers, 'To');
  const subject = getHeader(headers, 'Subject');
  const toEmails = to
    .split(',')
    .map(s => parseEmailAddress(s))
    .filter(Boolean);
  const internalDate = msg.internalDate ? new Date(parseInt(msg.internalDate, 10)).toISOString() : new Date().toISOString();
  return {
    gmail_message_id: msg.id,
    gmail_thread_id: msg.threadId,
    from_email: parseEmailAddress(from) || 'unknown',
    to_emails: toEmails,
    subject,
    snippet: (msg.snippet || '').slice(0, 500),
    received_at: internalDate,
  };
}

export async function fetchRecentMessages(accessToken: string, maxResults = 50, afterTimestamp?: number): Promise<GmailMessage[]> {
  let url = `${GMAIL_API_BASE}/messages?maxResults=${maxResults}&q=in:inbox`;
  if (afterTimestamp) {
    url += `+after:${Math.floor(afterTimestamp / 1000)}`;
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error: ${res.status} ${err}`);
  }
  const list = await res.json();
  const ids = (list.messages || []).map((m: { id: string }) => m.id).slice(0, maxResults);
  if (ids.length === 0) return [];

  const messages: GmailMessage[] = [];
  for (const id of ids) {
    const r = await fetch(`${GMAIL_API_BASE}/messages/${id}?format=metadata`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (r.ok) {
      messages.push(await r.json());
    }
  }
  return messages;
}

/** Fetch a single message with full body for parsing (e.g. job application detection). */
export async function fetchMessageFull(
  accessToken: string,
  messageId: string
): Promise<{ subject: string; from: string; body: string }> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error: ${res.status} ${err}`);
  }
  const msg: GmailMessage & { payload?: { body?: { data?: string }; parts?: Array<{ body?: { data?: string }; mimeType?: string }> } } = await res.json();
  const headers = msg.payload?.headers || [];
  const subject = getHeader(headers, 'Subject');
  const from = getHeader(headers, 'From');
  let body = '';
  const payload = msg.payload;
  if (payload?.body?.data) {
    try {
      body = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    } catch {
      body = '';
    }
  }
  if (!body && payload?.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        try {
          body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
          break;
        } catch {
          /* skip */
        }
      }
    }
  }
  return { subject, from, body: body.slice(0, 15000) };
}

/** List message IDs matching a query (e.g. job-related, last 7 days). */
export async function listMessages(
  accessToken: string,
  query: string,
  maxResults = 100
): Promise<{ id: string; threadId: string }[]> {
  const q = encodeURIComponent(query);
  const res = await fetch(
    `${GMAIL_API_BASE}/messages?maxResults=${maxResults}&q=${q}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error: ${res.status} ${err}`);
  }
  const list = await res.json();
  return (list.messages || []).map((m: { id: string; threadId: string }) => ({ id: m.id, threadId: m.threadId }));
}
