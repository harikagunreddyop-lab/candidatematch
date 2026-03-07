import { getStoredAuth, setStoredAuth, clearStoredAuth } from './storage';

// Keyboard shortcut → activate content script on current tab
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'activate-autofill') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'CM_ACTIVATE' });
  } catch {
    // ignore — tab might not accept messages (e.g., chrome://)
  }
});

// Message handler for auth status and token management
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const type = msg?.type as string | undefined;

  if (type === 'GET_AUTH_STATUS') {
    getStoredAuth().then((auth) => {
      if (!auth) {
        sendResponse({ connected: false });
        return;
      }
      sendResponse({
        connected: true,
        baseUrl: auth.baseUrl,
        minutesLeft: Math.max(0, Math.round((auth.expiry - Date.now()) / 60_000)),
      });
    });
    return true;
  }

  if (type === 'SAVE_TOKEN') {
    const { token, expiry, baseUrl } = msg;
    if (!token || !expiry || !baseUrl) {
      sendResponse({ ok: false, error: 'Missing fields' });
      return true;
    }
    setStoredAuth({ token, expiry, baseUrl }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (type === 'CLEAR_TOKEN') {
    clearStoredAuth().then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    // eslint-disable-next-line no-console
    console.log(
      '[CandidateMatch Autofill] Installed. Visit your CandidateMatch app → /connect-extension to connect the extension.'
    );
  }
});

export {};

