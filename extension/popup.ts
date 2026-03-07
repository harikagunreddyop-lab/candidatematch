const chipEl = document.getElementById('chip')!;
const chipText = document.getElementById('chip-text')!;
const infoEl = document.getElementById('info')!;
const actionsEl = document.getElementById('actions')!;
const timeEl = document.getElementById('time-left')!;

const BASE_URL_KEY = 'cm_base_url';

function getSavedUrl(): Promise<string> {
  return new Promise((r) => chrome.storage.local.get(BASE_URL_KEY, (d) => r(d[BASE_URL_KEY] || '')));
}

function renderConnected(state: { baseUrl: string; minutesLeft: number }): void {
  chipEl.className = 'chip connected';
  chipText.textContent = 'Connected';
  infoEl.innerHTML = 'Press <kbd>Ctrl+Shift+F</kbd> (Mac: <kbd>⌘⇧F</kbd>) on any job page to autofill.';
  timeEl.style.display = '';
  timeEl.textContent = `Session ~${state.minutesLeft}min · ${new URL(state.baseUrl).hostname}`;
  actionsEl.innerHTML = '<button class=\"btn btn-danger\" id=\"btn-disconnect\">🔌 Disconnect</button>';
  document.getElementById('btn-disconnect')!.onclick = () =>
    chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN' }, () => location.reload());
}

async function renderDisconnected(): Promise<void> {
  const saved = await getSavedUrl();
  chipEl.className = 'chip disconnected';
  chipText.textContent = 'Not connected';
  timeEl.style.display = 'none';
  infoEl.textContent = 'Enter your CandidateMatch app URL to connect.';

  actionsEl.innerHTML = `
    <input type="url" id="inp-url" placeholder="${saved || 'https://app.candidatematch.com'}" value="${saved}" />
    <button class="btn btn-primary" id="btn-connect">🔗 Open Connect Page</button>
    <div class="hint">
      Sign in to your CandidateMatch app first,<br/>then click above to link your account.
    </div>
  `;

  document.getElementById('btn-connect')!.addEventListener('click', () => {
    const raw = ((document.getElementById('inp-url') as HTMLInputElement).value || saved).trim().replace(/\/$/, '');
    if (!raw.startsWith('http')) { alert('Enter a full URL starting with https://'); return; }
    chrome.storage.local.set({ [BASE_URL_KEY]: raw });
    window.open(`${raw}/connect-extension`, '_blank');
  });
}

chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (state) => {
  if (state?.connected) renderConnected(state);
  else renderDisconnected();
});

