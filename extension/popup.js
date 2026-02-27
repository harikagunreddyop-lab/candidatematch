// popup.js — Extension popup (vanilla JS, no bundler)
// Communicates with background.ts via chrome.runtime.sendMessage.
//
// baseUrl is stored by background.ts after the user connects via /connect-extension.
// The popup only needs the baseUrl for the "Connect Account" button the very first time.

const chip = document.getElementById('status-chip');
const chipText = document.getElementById('status-text');
const infoEl = document.getElementById('status-info');
const actionsEl = document.getElementById('actions');
const timeEl = document.getElementById('time-left');

const BASE_URL_KEY = 'cm_base_url';

/** Persist the user-entered base URL so we reuse it after reconnections. */
function saveBaseUrl(url) {
    chrome.storage.local.set({ [BASE_URL_KEY]: url });
}

function getSavedBaseUrl(cb) {
    chrome.storage.local.get(BASE_URL_KEY, (r) => cb(r[BASE_URL_KEY] || ''));
}

function btn(label, id, cls) {
    return `<button id="${id}" class="btn ${cls}">${label}</button>`;
}

function renderConnected(state) {
    chip.className = 'status-chip connected';
    chipText.textContent = 'Connected';
    infoEl.textContent = `Press Ctrl+Shift+F (Mac: ⌘⇧F) on any job page to autofill.`;
    timeEl.style.display = '';
    timeEl.textContent = `Session expires in ~${state.minutesLeft} min · ${state.baseUrl}`;
    actionsEl.innerHTML = btn('🔌 Disconnect', 'btn-disconnect', 'btn-danger');
    document.getElementById('btn-disconnect').onclick = () => {
        chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN' }, () => location.reload());
    };
}

function renderDisconnected() {
    chip.className = 'status-chip disconnected';
    chipText.textContent = 'Not connected';
    timeEl.style.display = 'none';

    getSavedBaseUrl((saved) => {
        const placeholder = saved || 'http://localhost:3000';

        infoEl.innerHTML = `Enter your CandidateMatch app URL, then click <strong>Connect</strong>.`;
        actionsEl.innerHTML = `
      <input
        id="inp-url"
        type="url"
        placeholder="${placeholder}"
        value="${saved}"
        style="
          width:100%;margin-bottom:8px;padding:8px 10px;
          background:#0f0f1a;border:1px solid #2a2a4c;border-radius:9px;
          color:#e8e8f0;font-size:12px;outline:none;box-sizing:border-box;
        "
      />
      ${btn('🔗 Open Connect Page', 'btn-connect', 'btn-primary')}
      <p style="font-size:10px;color:#555;margin-top:8px;text-align:center;">
        Sign in to your app first, then click above.
      </p>
    `;

        document.getElementById('btn-connect').onclick = () => {
            const raw = (document.getElementById('inp-url').value || placeholder).trim();
            // Normalise: strip trailing slash
            const base = raw.replace(/\/$/, '');
            if (!base.startsWith('http')) {
                alert('Please enter a full URL starting with http:// or https://');
                return;
            }
            saveBaseUrl(base);
            chrome.storage.local.set({ cm_base_url: base });
            window.open(`${base}/dashboard/candidate/connect-extension`, '_blank');
        };
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (state) => {
    if (state?.connected) {
        renderConnected(state);
    } else {
        renderDisconnected();
    }
});
