/* Service worker — handles token refresh and messaging between popup ↔ content */

chrome.alarms.create('token-refresh', { periodInMinutes: 45 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'token-refresh') return;
  const { supabaseUrl, anonKey, refreshToken } = await chrome.storage.local.get([
    'supabaseUrl', 'anonKey', 'refreshToken',
  ]);
  if (!supabaseUrl || !refreshToken || !anonKey) return;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return;
    const data = await res.json();
    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    });
  } catch { /* silent */ }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_PROFILE') {
    chrome.storage.local.get('profileData').then((d) => {
      sendResponse(d.profileData || null);
    });
    return true;
  }
  if (msg.type === 'FETCH_PROFILE') {
    fetchAndCacheProfile().then(sendResponse);
    return true;
  }
});

async function fetchAndCacheProfile() {
  const { appUrl, accessToken, selectedCandidateId } = await chrome.storage.local.get([
    'appUrl', 'accessToken', 'selectedCandidateId',
  ]);
  if (!appUrl || !accessToken) return null;

  const url = selectedCandidateId
    ? `${appUrl}/api/autofill-profile?candidate_id=${selectedCandidateId}`
    : `${appUrl}/api/autofill-profile`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.mode) return null; // candidate list response, not profile data
    await chrome.storage.local.set({ profileData: data });
    return data;
  } catch {
    return null;
  }
}
