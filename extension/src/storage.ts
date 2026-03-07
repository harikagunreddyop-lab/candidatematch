export interface StoredAuth {
  token: string;
  expiry: number; // unix ms
  baseUrl: string; // e.g. https://app.candidatematch.com (no trailing slash)
}

const TOKEN_KEY = 'cm_auth_v2';
const BASE_URL_KEY = 'cm_base_url';

export async function getStoredAuth(): Promise<StoredAuth | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(TOKEN_KEY, (result) => {
      const stored = result[TOKEN_KEY] as StoredAuth | undefined;
      if (!stored?.token) return resolve(null);
      if (Date.now() > stored.expiry - 30_000) {
        chrome.storage.local.remove(TOKEN_KEY, () => resolve(null));
        return;
      }
      resolve(stored);
    });
  });
}

export async function setStoredAuth(data: StoredAuth): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TOKEN_KEY]: data, [BASE_URL_KEY]: data.baseUrl }, resolve);
  });
}

export async function clearStoredAuth(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([TOKEN_KEY], resolve);
  });
}

export async function getSavedBaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(BASE_URL_KEY, (r) => resolve(r[BASE_URL_KEY] || ''));
  });
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getStoredAuth()) !== null;
}

