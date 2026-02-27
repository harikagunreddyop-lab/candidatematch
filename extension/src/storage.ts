/**
 * storage.ts — Chrome storage helpers for CandidateMatch token.
 *
 * Security:
 * - Stores ONLY { token, expiry, baseUrl } — no PII, no passwords.
 * - Token = Supabase JWT (~1hr TTL). Auto-cleared when expired.
 * - baseUrl = CandidateMatch deployment URL (e.g. https://app.candidatematch.com)
 */

export interface StoredAuth {
    token: string;
    expiry: number; // unix ms
    baseUrl: string; // e.g. https://app.candidatematch.com (no trailing slash)
}

const TOKEN_KEY = 'cm_auth_v1';

/** Returns valid token or null if missing / expired. */
export async function getStoredAuth(): Promise<StoredAuth | null> {
    return new Promise((resolve) => {
        chrome.storage.local.get(TOKEN_KEY, (result) => {
            const stored = result[TOKEN_KEY] as StoredAuth | undefined;
            if (!stored || !stored.token) return resolve(null);
            // Clear and reject if expired (add 30s buffer for clock skew)
            if (Date.now() > stored.expiry - 30_000) {
                chrome.storage.local.remove(TOKEN_KEY, () => resolve(null));
                return;
            }
            resolve(stored);
        });
    });
}

/** Persist auth. Called by the token handler when /connect-extension sends the token. */
export async function setStoredAuth(data: StoredAuth): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [TOKEN_KEY]: data }, resolve);
    });
}

/** Clear stored auth. */
export async function clearStoredAuth(): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.remove(TOKEN_KEY, resolve);
    });
}

/** True if a non-expired token exists. */
export async function isAuthenticated(): Promise<boolean> {
    const auth = await getStoredAuth();
    return auth !== null;
}
