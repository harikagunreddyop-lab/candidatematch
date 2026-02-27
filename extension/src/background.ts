/**
 * background.ts — MV3 Service Worker
 *
 * Responsibilities:
 * 1. Handle the "activate-autofill" keyboard command → forward to active tab content script.
 * 2. Handle SAVE_TOKEN message from the connect-extension content script.
 * 3. Handle AUTH_STATUS queries from popup.
 */

import { setStoredAuth, getStoredAuth, clearStoredAuth } from './storage';

// ── Command handler ───────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'activate-autofill') return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { type: 'CM_ACTIVATE' }).catch(() => {
        // Content script may not be injected on this URL (chrome:// etc.) — silent fail
    });
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const type = msg?.type as string | undefined;

    if (type === 'SAVE_TOKEN') {
        // Sent by content script running on /connect-extension page
        const { token, expiry, baseUrl } = msg;
        if (!token || !expiry || !baseUrl) {
            sendResponse({ ok: false, error: 'Missing token/expiry/baseUrl' });
            return true;
        }
        setStoredAuth({ token, expiry, baseUrl }).then(() => {
            sendResponse({ ok: true });
        });
        return true; // async response
    }

    if (type === 'GET_AUTH_STATUS') {
        getStoredAuth().then((auth) => {
            if (!auth) return sendResponse({ connected: false });
            const minutesLeft = Math.max(0, Math.round((auth.expiry - Date.now()) / 60_000));
            sendResponse({ connected: true, baseUrl: auth.baseUrl, minutesLeft });
        });
        return true;
    }

    if (type === 'CLEAR_TOKEN') {
        clearStoredAuth().then(() => sendResponse({ ok: true }));
        return true;
    }

    return false;
});

// ── Install handler ───────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
        // Open connect-extension page on first install.
        // We don't know the base URL yet so this can only be done after token is saved.
        // Instead, we open the Chrome Web Store listing (or a local tab if in dev).
        // Assumption: extension opening the connect page directly is not possible without baseUrl.
        // The user should navigate to their CandidateMatch app and visit /connect-extension.
        console.log('[CM Autofill] Extension installed. Visit your CandidateMatch app → /connect-extension to connect.');
    }
});

export { };
