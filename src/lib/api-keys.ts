/**
 * API key management for company-scoped external API access.
 * Keys are stored in Redis (Upstash): api_key:{keyId} and company:{companyId}:api_keys.
 * Use x-api-key header on external/public API routes; validate with validateApiKey().
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { upstash } from './redis-upstash';

const PREFIX = 'cm_live_';
const KEY_ID_LENGTH = 12;
const SECRET_LENGTH = 32;

const API_KEY_PREFIX = 'api_key:';
const COMPANY_KEYS_PREFIX = 'company:';

export interface ApiKeyMeta {
  keyId: string;
  name: string | null;
  createdAt: string;
  companyId: string;
}

interface StoredKey {
  companyId: string;
  secretHash: string;
  name: string | null;
  createdAt: string;
}

function toKeyId(fullKey: string): string | null {
  if (!fullKey || !fullKey.startsWith(PREFIX)) return null;
  const rest = fullKey.slice(PREFIX.length);
  const idx = rest.indexOf('_');
  if (idx !== KEY_ID_LENGTH) return null;
  return rest.slice(0, KEY_ID_LENGTH);
}

function toSecret(fullKey: string): string | null {
  if (!fullKey || !fullKey.startsWith(PREFIX)) return null;
  const rest = fullKey.slice(PREFIX.length);
  const idx = rest.indexOf('_');
  if (idx !== KEY_ID_LENGTH) return null;
  return rest.slice(KEY_ID_LENGTH + 1);
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** Generate a new API key for a company. Returns the full key once; store it securely. */
export async function generateApiKey(
  companyId: string,
  name: string | null = null
): Promise<{ key: string; keyId: string } | null> {
  if (!upstash || !companyId) return null;
  const keyId = randomBytes(6).toString('hex'); // 12 chars
  const secret = randomBytes(SECRET_LENGTH).toString('hex');
  const fullKey = `${PREFIX}${keyId}_${secret}`;
  const secretHash = hashSecret(secret);
  const createdAt = new Date().toISOString();
  const stored: StoredKey = { companyId, secretHash, name, createdAt };
  const rk = `${API_KEY_PREFIX}${keyId}`;
  const ck = `${COMPANY_KEYS_PREFIX}${companyId}:api_keys`;
  try {
    await upstash.set(rk, JSON.stringify(stored));
    await upstash.sadd(ck, keyId);
    return { key: fullKey, keyId };
  } catch {
    return null;
  }
}

/** Validate x-api-key header value. Returns companyId and keyId if valid. */
export async function validateApiKey(
  headerValue: string | null | undefined
): Promise<{ companyId: string; keyId: string } | null> {
  if (!upstash || !headerValue || typeof headerValue !== 'string') return null;
  const trimmed = headerValue.trim();
  const keyId = toKeyId(trimmed);
  const secret = toSecret(trimmed);
  if (!keyId || !secret) return null;
  try {
    const raw = await upstash.get<string>(`${API_KEY_PREFIX}${keyId}`);
    if (!raw) return null;
    const stored: StoredKey = JSON.parse(raw);
    const inputHash = hashSecret(secret);
    if (!secureCompare(inputHash, stored.secretHash)) return null;
    return { companyId: stored.companyId, keyId };
  } catch {
    return null;
  }
}

/** Revoke a single API key by keyId. */
export async function revokeApiKey(keyId: string): Promise<boolean> {
  if (!upstash || !keyId) return false;
  try {
    const raw = await upstash.get<string>(`${API_KEY_PREFIX}${keyId}`);
    if (raw) {
      const stored: StoredKey = JSON.parse(raw);
      await upstash.del(`${API_KEY_PREFIX}${keyId}`);
      await upstash.srem(`${COMPANY_KEYS_PREFIX}${stored.companyId}:api_keys`, keyId);
    }
    return true;
  } catch {
    return false;
  }
}

/** Revoke all API keys for a company. */
export async function revokeAllApiKeysForCompany(companyId: string): Promise<number> {
  if (!upstash || !companyId) return 0;
  try {
    const keyIds = await upstash.smembers(`${COMPANY_KEYS_PREFIX}${companyId}:api_keys`) as string[];
    for (const id of keyIds) {
      await upstash.del(`${API_KEY_PREFIX}${id}`);
    }
    if (keyIds.length > 0) {
      await upstash.del(`${COMPANY_KEYS_PREFIX}${companyId}:api_keys`);
    }
    return keyIds.length;
  } catch {
    return 0;
  }
}

/** List API keys for a company (metadata only; secrets are never returned). */
export async function listApiKeys(companyId: string): Promise<ApiKeyMeta[]> {
  if (!upstash || !companyId) return [];
  try {
    const keyIds = await upstash.smembers(`${COMPANY_KEYS_PREFIX}${companyId}:api_keys`) as string[];
    const result: ApiKeyMeta[] = [];
    for (const id of keyIds) {
      const raw = await upstash.get<string>(`${API_KEY_PREFIX}${id}`);
      if (raw) {
        const stored: StoredKey = JSON.parse(raw);
        result.push({
          keyId: id,
          name: stored.name,
          createdAt: stored.createdAt,
          companyId: stored.companyId,
        });
      }
    }
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return result;
  } catch {
    return [];
  }
}

/** Get API key from request (x-api-key header). */
export function getApiKeyFromRequest(request: Request): string | null {
  const v = request.headers.get('x-api-key');
  return v?.trim() || null;
}

/** Validate request API key. Returns { companyId, keyId } or { error: NextResponse } for 401. */
export async function requireApiKey(
  request: Request
): Promise<
  | { companyId: string; keyId: string }
  | { error: NextResponse }
> {
  const raw = getApiKeyFromRequest(request);
  const result = await validateApiKey(raw);
  if (result) return result;
  return {
    error: NextResponse.json(
      { error: 'Missing or invalid x-api-key header' },
      { status: 401 }
    ),
  };
}
