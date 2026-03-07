import type { ProfileKey } from '../autofill/ats-patterns';

export interface FieldListItem {
  label: string;
  fingerprint: string;
  status: 'filled' | 'review' | 'skipped';
}

export interface PanelCallbacks {
  onRerun: () => void;
  onCorrection: (fingerprint: string, profileKey: ProfileKey) => void;
  onCoverLetter: () => void;
  onSkipField: (fingerprint: string) => void;
}

export const ALL_PROFILE_KEYS: ProfileKey[] = [
  'firstName', 'lastName', 'fullName', 'email', 'phone',
  'city', 'state', 'zipCode', 'country', 'location', 'address1', 'address2',
  'currentTitle', 'currentCompany', 'yearsExperience',
  'linkedinUrl', 'githubUrl', 'portfolioUrl',
  'summary', 'defaultPitch', 'skills',
  'degree', 'school', 'major', 'graduationDate',
  'salaryExpectation', 'salaryMin', 'salaryMax',
  'availability', 'openToRemote', 'openToRelocate',
  'authorizedToWork', 'requiresSponsorship', 'visaStatus',
  'gender', 'ethnicity', 'veteranStatus', 'disabilityStatus',
];

const PROFILE_KEY_LABELS: Partial<Record<ProfileKey, string>> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  fullName: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  city: 'City',
  state: 'State',
  zipCode: 'Zip Code',
  country: 'Country',
  location: 'Location',
  address1: 'Address',
  address2: 'Address 2',
  currentTitle: 'Job Title',
  currentCompany: 'Company',
  yearsExperience: 'Years Exp.',
  linkedinUrl: 'LinkedIn',
  githubUrl: 'GitHub',
  portfolioUrl: 'Portfolio/Website',
  summary: 'Summary/Bio',
  defaultPitch: 'Cover Letter',
  skills: 'Skills',
  degree: 'Degree',
  school: 'School/University',
  major: 'Major',
  graduationDate: 'Graduation Date',
  salaryExpectation: 'Expected Salary',
  salaryMin: 'Min Salary',
  salaryMax: 'Max Salary',
  availability: 'Availability',
  openToRemote: 'Open to Remote',
  openToRelocate: 'Open to Relocate',
  authorizedToWork: 'Auth. to Work',
  requiresSponsorship: 'Needs Sponsorship',
  visaStatus: 'Visa Status',
  gender: 'Gender',
  ethnicity: 'Ethnicity',
  veteranStatus: 'Veteran Status',
  disabilityStatus: 'Disability',
};

let panelHost: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let callbacks: PanelCallbacks | null = null;
let minimized = false;

const PANEL_CSS = `
  :host { all: initial; }
  *, *::before, *::after { box-sizing: border-box; }

  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  #cm-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    width: 300px;
    background: rgba(15, 15, 30, 0.97);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(124, 131, 253, 0.25);
    border-radius: 16px;
    box-shadow:
      0 0 0 1px rgba(124, 131, 253, 0.08),
      0 20px 60px rgba(0, 0, 0, 0.7),
      0 0 80px rgba(124, 131, 253, 0.06) inset;
    color: #e2e4f0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    overflow: hidden;
    user-select: none;
    animation: cm-enter 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes cm-enter {
    from { opacity: 0; transform: translateY(16px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .cm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 10px;
    background: linear-gradient(135deg, rgba(124,131,253,0.12) 0%, rgba(139,92,246,0.08) 100%);
    border-bottom: 1px solid rgba(124,131,253,0.15);
    cursor: move;
  }

  .cm-brand {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .cm-logo-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #7c83fd;
    box-shadow: 0 0 8px #7c83fd;
    animation: cm-pulse 2s ease-in-out infinite;
  }

  @keyframes cm-pulse {
    0%,100% { opacity: 1; box-shadow: 0 0 8px #7c83fd; }
    50%      { opacity: 0.6; box-shadow: 0 0 4px #7c83fd; }
  }

  .cm-brand-name {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.3px;
    background: linear-gradient(90deg, #7c83fd, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .cm-ats-badge {
    font-size: 10px;
    font-weight: 600;
    color: #888;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 2px 7px;
    margin-left: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cm-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .cm-icon-btn {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 6px;
    font-size: 14px;
    line-height: 1;
    transition: color 0.15s, background 0.15s;
  }
  .cm-icon-btn:hover { color: #bbb; background: rgba(255,255,255,0.06); }

  .cm-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: rgba(124,131,253,0.08);
    border-bottom: 1px solid rgba(124,131,253,0.1);
  }

  .cm-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 4px;
    background: rgba(15,15,30,0.97);
    gap: 2px;
  }

  .cm-stat-num {
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    color: #7c83fd;
  }
  .cm-stat-num.green  { color: #34d399; }
  .cm-stat-num.amber  { color: #f59e0b; }
  .cm-stat-num.purple { color: #7c83fd; }

  .cm-stat-lbl {
    font-size: 9px;
    font-weight: 600;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cm-status {
    padding: 7px 14px;
    font-size: 11px;
    font-weight: 500;
    color: #666;
    min-height: 30px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .cm-status.ok  { color: #34d399; }
  .cm-status.err { color: #f87171; }
  .cm-status.info { color: #888; }
  .cm-status.loading { color: #7c83fd; }

  .cm-spinner {
    width: 10px; height: 10px;
    border: 2px solid rgba(124,131,253,0.2);
    border-top-color: #7c83fd;
    border-radius: 50%;
    animation: cm-spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes cm-spin { to { transform: rotate(360deg); } }

  .cm-body { padding: 12px 14px; }

  .cm-field-section { margin-bottom: 10px; }

  .cm-section-title {
    font-size: 9px;
    font-weight: 700;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
  }

  .cm-field-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .cm-field-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: default;
    border: 1px solid transparent;
    transition: all 0.15s;
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cm-field-tag.filled {
    background: rgba(52, 211, 153, 0.08);
    border-color: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }

  .cm-field-tag.review {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
    cursor: pointer;
  }
  .cm-field-tag.review:hover {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.4);
  }

  .cm-field-tag.skipped {
    background: rgba(255,255,255,0.03);
    border-color: rgba(255,255,255,0.08);
    color: #444;
  }

  .cm-tag-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .filled .cm-tag-dot  { background: #34d399; }
  .review .cm-tag-dot  { background: #f59e0b; }
  .skipped .cm-tag-dot { background: #444; }

  .cm-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin-bottom: 10px;
  }

  .cm-btn {
    padding: 8px 10px;
    border: none;
    border-radius: 9px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-family: inherit;
  }
  .cm-btn:active { transform: scale(0.97); }

  .cm-btn-primary {
    background: linear-gradient(135deg, #7c83fd 0%, #8b5cf6 100%);
    color: #fff;
    box-shadow: 0 2px 12px rgba(124, 131, 253, 0.3);
  }
  .cm-btn-primary:hover { box-shadow: 0 4px 16px rgba(124, 131, 253, 0.45); opacity: 0.92; }

  .cm-btn-secondary {
    background: rgba(124,131,253,0.1);
    color: #9da4fd;
    border: 1px solid rgba(124,131,253,0.2);
  }
  .cm-btn-secondary:hover { background: rgba(124,131,253,0.16); }

  .cm-btn-full {
    grid-column: span 2;
    background: linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(124,131,253,0.12) 100%);
    color: #a78bfa;
    border: 1px solid rgba(139,92,246,0.25);
  }
  .cm-btn-full:hover { background: rgba(139,92,246,0.2); }

  .cm-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

  .cm-cl-result {
    display: none;
    margin-top: 8px;
    padding: 10px;
    background: rgba(124,131,253,0.06);
    border: 1px solid rgba(124,131,253,0.15);
    border-radius: 10px;
    font-size: 11px;
    color: #bbb;
    line-height: 1.5;
    max-height: 160px;
    overflow-y: auto;
    white-space: pre-wrap;
  }
  .cm-cl-result.visible { display: block; }
  .cm-cl-result::-webkit-scrollbar { width: 4px; }
  .cm-cl-result::-webkit-scrollbar-thumb { background: rgba(124,131,253,0.3); border-radius: 4px; }

  .cm-reauth {
    margin-top: 10px;
    padding: 9px 12px;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 9px;
    font-size: 11px;
    color: #fca5a5;
    text-align: center;
  }
  .cm-reauth a { color: #f87171; font-weight: 700; text-decoration: underline; }

  .cm-footer {
    padding: 7px 14px;
    border-top: 1px solid rgba(255,255,255,0.04);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cm-shortcut {
    font-size: 10px;
    color: #444;
  }
  .cm-shortcut kbd {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    color: #666;
    font-family: inherit;
  }

  .cm-time-saved {
    font-size: 10px;
    color: #34d399;
    font-weight: 600;
  }

  .cm-picker {
    position: fixed;
    z-index: 2147483648;
    background: #0f0f1e;
    border: 1px solid rgba(124,131,253,0.3);
    border-radius: 12px;
    padding: 8px;
    width: 220px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,131,253,0.1);
    font-family: 'Inter', sans-serif;
    animation: cm-enter 0.15s ease both;
  }
`;

export function createPanel(opts: PanelCallbacks & { atsType: string }): void {
  if (panelHost) return;
  callbacks = opts;

  panelHost = document.createElement('div');
  panelHost.id = 'cm-autofill-v2-host';
  shadow = panelHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'cm-panel';
  panel.innerHTML = buildPanelHTML(opts.atsType);
  shadow.appendChild(panel);
  document.documentElement.appendChild(panelHost);

  shadow.getElementById('cm-close')?.addEventListener('click', destroyPanel);
  shadow.getElementById('cm-minimize')?.addEventListener('click', toggleMinimize);
  shadow.getElementById('cm-btn-rerun')?.addEventListener('click', () => callbacks?.onRerun());
  shadow.getElementById('cm-btn-cl')?.addEventListener('click', () => callbacks?.onCoverLetter());

  const header = shadow.querySelector('.cm-header') as HTMLElement | null;
  if (header) enableDrag(header, panel);
}

function buildPanelHTML(atsType: string): string {
  return `
    <div class="cm-header">
      <div class="cm-brand">
        <div class="cm-logo-dot"></div>
        <span class="cm-brand-name">CandidateMatch</span>
        <span class="cm-ats-badge">${atsType}</span>
      </div>
      <div class="cm-header-actions">
        <button class="cm-icon-btn" id="cm-minimize" title="Minimize">−</button>
        <button class="cm-icon-btn" id="cm-close" title="Close">✕</button>
      </div>
    </div>
    <div id="cm-collapsible">
      <div class="cm-stats">
        <div class="cm-stat">
          <div class="cm-stat-num purple" id="cm-n-detected">–</div>
          <div class="cm-stat-lbl">Detected</div>
        </div>
        <div class="cm-stat">
          <div class="cm-stat-num green" id="cm-n-filled">–</div>
          <div class="cm-stat-lbl">Filled</div>
        </div>
        <div class="cm-stat">
          <div class="cm-stat-num amber" id="cm-n-review">–</div>
          <div class="cm-stat-lbl">Review</div>
        </div>
      </div>
      <div class="cm-status info" id="cm-status">
        <div class="cm-spinner"></div>
        Initializing…
      </div>
      <div class="cm-body">
        <div id="cm-field-section" class="cm-field-section" style="display:none">
          <div class="cm-section-title">Fields mapped</div>
          <div class="cm-field-list" id="cm-field-list"></div>
        </div>
        <div class="cm-actions">
          <button class="cm-btn cm-btn-primary" id="cm-btn-rerun">↺ Re-run</button>
          <button class="cm-btn cm-btn-secondary" id="cm-btn-cl">✦ Cover Letter</button>
        </div>
        <div class="cm-cl-result" id="cm-cl-result"></div>
        <div id="cm-reauth" style="display:none"></div>
      </div>
      <div class="cm-footer">
        <span class="cm-shortcut"><kbd>Ctrl+Shift+F</kbd> to re-run</span>
        <span class="cm-time-saved" id="cm-time-saved"></span>
      </div>
    </div>
  `;
}

function toggleMinimize(): void {
  if (!shadow) return;
  const col = shadow.getElementById('cm-collapsible') as HTMLElement;
  minimized = !minimized;
  col.style.display = minimized ? 'none' : '';
  const btn = shadow.getElementById('cm-minimize') as HTMLElement;
  btn.textContent = minimized ? '+' : '−';
}

export function setStatus(msg: string, type: 'ok' | 'err' | 'info' | 'loading'): void {
  if (!shadow) return;
  const el = shadow.getElementById('cm-status') as HTMLElement;
  el.className = `cm-status ${type}`;
  const spinner = type === 'loading' ? '<div class="cm-spinner"></div>' : '';
  el.innerHTML = `${spinner}${msg}`;
}

export function updateStats(
  detected: number,
  filled: number,
  review: number,
  timeSavedSeconds: number
): void {
  if (!shadow) return;
  const get = (id: string) => shadow!.getElementById(id) as HTMLElement;
  get('cm-n-detected').textContent = String(detected);
  get('cm-n-filled').textContent = String(filled);
  get('cm-n-review').textContent = String(review);
  if (timeSavedSeconds > 0) {
    get('cm-time-saved').textContent = `~${Math.round(timeSavedSeconds / 60)}m saved`;
  }
}

export function renderFieldList(items: FieldListItem[]): void {
  if (!shadow) return;
  const section = shadow.getElementById('cm-field-section') as HTMLElement;
  const list = shadow.getElementById('cm-field-list') as HTMLElement;
  if (!items.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  list.innerHTML = items
    .map(
      (m) => `
    <span
      class="cm-field-tag ${m.status}"
      data-fp="${m.fingerprint}"
      title="${m.status === 'review' ? 'Click to reassign this field' : m.label}"
    >
      <span class="cm-tag-dot"></span>
      ${m.label.slice(0, 18)}
    </span>`
    )
    .join('');

  list.querySelectorAll('.cm-field-tag.review').forEach((tag) => {
    tag.addEventListener('click', (e) => {
      const fp = (tag as HTMLElement).dataset.fp || '';
      const label = tag.getAttribute('title') || '';
      openCorrectionPicker(fp, label, e as MouseEvent);
    });
  });
}

export function showCoverLetterResult(text: string): void {
  if (!shadow) return;
  const el = shadow.getElementById('cm-cl-result') as HTMLElement;
  el.textContent = text;
  el.classList.add('visible');
}

export function setCoverLetterLoading(loading: boolean): void {
  if (!shadow) return;
  const btn = shadow.getElementById('cm-btn-cl') as HTMLButtonElement;
  btn.disabled = loading;
  btn.textContent = loading ? '⟳ Generating…' : '✦ Cover Letter';
}

export function showReauthBanner(connectUrl: string): void {
  if (!shadow) return;
  const el = shadow.getElementById('cm-reauth') as HTMLElement;
  el.style.display = '';
  el.innerHTML = `<div class="cm-reauth">Session expired. <a href="${connectUrl}" target="_blank">Reconnect →</a></div>`;
}

export function destroyPanel(): void {
  panelHost?.remove();
  panelHost = null;
  shadow = null;
  callbacks = null;
  document.getElementById('cm-highlight-styles')?.remove();
}

function openCorrectionPicker(fingerprint: string, fieldLabel: string, event: MouseEvent): void {
  document.querySelectorAll('#cm-picker-portal').forEach((p) => p.remove());

  const picker = document.createElement('div');
  picker.id = 'cm-picker-portal';
  picker.setAttribute(
    'style',
    `
    position: fixed;
    z-index: 2147483648;
    background: #0f0f1e;
    border: 1px solid rgba(124,131,253,0.3);
    border-radius: 12px;
    padding: 8px;
    width: 220px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.7);
    font-family: -apple-system, 'Inter', sans-serif;
    top: ${Math.min(event.clientY + 8, window.innerHeight - 280)}px;
    left: ${Math.min(event.clientX, window.innerWidth - 230)}px;
  `
  );

  const title = document.createElement('div');
  title.setAttribute(
    'style',
    'font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;padding:2px 6px 8px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:4px;'
  );
  title.textContent = `Map "${fieldLabel.slice(0, 28)}" to:`;
  picker.appendChild(title);

  const search = document.createElement('input');
  search.placeholder = 'Search fields…';
  search.setAttribute(
    'style',
    'width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#e2e4f0;font-size:12px;padding:6px 10px;outline:none;margin-bottom:5px;box-sizing:border-box;'
  );
  picker.appendChild(search);

  const list = document.createElement('div');
  list.setAttribute('style', 'max-height:200px;overflow-y:auto;');

  const renderOptions = (filter: string) => {
    list.innerHTML = '';
    const filtered = ALL_PROFILE_KEYS.filter(
      (k) =>
        !filter ||
        k.toLowerCase().includes(filter) ||
        (PROFILE_KEY_LABELS[k] || '').toLowerCase().includes(filter)
    );
    for (const key of filtered) {
      const btn = document.createElement('button');
      btn.setAttribute(
        'style',
        'display:block;width:100%;text-align:left;background:none;border:none;padding:6px 9px;font-size:12px;color:#b0b4d0;cursor:pointer;border-radius:6px;font-family:inherit;'
      );
      btn.textContent = PROFILE_KEY_LABELS[key] || key;
      btn.onmouseover = () => {
        btn.style.background = 'rgba(124,131,253,0.12)';
        btn.style.color = '#7c83fd';
      };
      btn.onmouseout = () => {
        btn.style.background = '';
        btn.style.color = '#b0b4d0';
      };
      btn.addEventListener('click', () => {
        callbacks?.onCorrection(fingerprint, key as ProfileKey);
        picker.remove();
      });
      list.appendChild(btn);
    }

    const skip = document.createElement('button');
    skip.setAttribute(
      'style',
      'display:block;width:100%;text-align:left;background:none;border:none;padding:6px 9px;font-size:12px;color:#555;cursor:pointer;border-radius:6px;font-family:inherit;border-top:1px solid rgba(255,255,255,0.04);margin-top:4px;'
    );
    skip.textContent = '✕ Skip this field';
    skip.onmouseover = () => {
      skip.style.background = 'rgba(239,68,68,0.08)';
      skip.style.color = '#f87171';
    };
    skip.onmouseout = () => {
      skip.style.background = '';
      skip.style.color = '#555';
    };
    skip.addEventListener('click', () => {
      callbacks?.onSkipField(fingerprint);
      picker.remove();
    });
    list.appendChild(skip);
  };

  renderOptions('');
  search.addEventListener('input', () => renderOptions(search.value.toLowerCase().trim()));
  picker.appendChild(list);
  document.body.appendChild(picker);
  search.focus();

  const close = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) {
      picker.remove();
      document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}

export function injectHighlightStyles(): void {
  if (document.getElementById('cm-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 'cm-highlight-styles';
  style.textContent = `
    .cm-field-filled {
      outline: 2px solid rgba(52,211,153,0.6) !important;
      outline-offset: 2px !important;
      transition: outline 0.3s ease !important;
    }
    .cm-field-review {
      outline: 2px solid rgba(245,158,11,0.7) !important;
      outline-offset: 2px !important;
      cursor: pointer !important;
    }
    .cm-field-filled { animation: cm-fill-flash 0.4s ease; }
    @keyframes cm-fill-flash {
      0%   { outline-color: rgba(124,131,253,0.9); outline-width: 3px; }
      100% { outline-color: rgba(52,211,153,0.6);  outline-width: 2px; }
    }
  `;
  document.head.appendChild(style);
}

export function highlightField(el: HTMLElement, status: 'filled' | 'review'): void {
  el.classList.remove('cm-field-filled', 'cm-field-review');
  if (status === 'filled') el.classList.add('cm-field-filled');
  if (status === 'review') el.classList.add('cm-field-review');
}

function enableDrag(handle: HTMLElement, panel: HTMLElement): void {
  let startX = 0;
  let startY = 0;
  let startRight = 0;
  let startBottom = 0;
  const onMove = (e: MouseEvent) => {
    panel.style.right = `${Math.max(0, startRight - (e.clientX - startX))}px`;
    panel.style.bottom = `${Math.max(0, startBottom - (e.clientY - startY))}px`;
    panel.style.left = 'auto';
    panel.style.top = 'auto';
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    const s = getComputedStyle(panel);
    startRight = parseInt(s.right, 10) || 24;
    startBottom = parseInt(s.bottom, 10) || 24;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

