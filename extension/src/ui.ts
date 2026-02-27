/**
 * ui.ts — Floating mini-panel + field highlights + correction picker.
 *
 * Uses Shadow DOM for style isolation — extension styles never bleed into
 * the host page, and page styles never bleed into the panel.
 *
 * Safety: Never interacts with submit buttons or CAPTCHA elements.
 */

// ── Panel state ───────────────────────────────────────────────────────────────
let panelHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;

// Callbacks set by content.ts
let _onRerun: (() => void) | null = null;
let _onSaveCorrection: ((fp: string, key: string) => void) | null = null;

// Profile keys available in the correction picker
const ALL_PROFILE_KEYS = [
    'firstName', 'lastName', 'fullName', 'email', 'phone',
    'city', 'state', 'zipCode', 'country', 'location',
    'linkedinUrl', 'githubUrl', 'portfolioUrl',
    'currentTitle', 'currentCompany', 'yearsExperience',
    'school', 'degree', 'major', 'graduationDate',
    'salaryExpectation', 'salaryMin', 'salaryMax',
    'availability', 'openToRemote', 'openToRelocate',
    'authorizedToWork', 'requiresSponsorship', 'visaStatus',
    'summary', 'defaultPitch', 'skills',
];

// ── CSS ───────────────────────────────────────────────────────────────────────
const PANEL_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

  #cm-panel {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    width: 280px;
    background: #1a1a2e;
    border: 1px solid #3a3a5c;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    color: #e8e8f0;
    overflow: hidden;
    user-select: none;
    animation: cm-slide-in 0.2s ease;
  }

  @keyframes cm-slide-in {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .cm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #16213e;
    border-bottom: 1px solid #2a2a4c;
    cursor: move;
  }

  .cm-logo { font-size: 13px; font-weight: 700; color: #7c83fd; letter-spacing: -0.2px; }
  .cm-close { background: none; border: none; color: #888; cursor: pointer; font-size: 16px; padding: 0 2px; line-height: 1; }
  .cm-close:hover { color: #fff; }

  .cm-body { padding: 12px 14px; }

  .cm-stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }

  .cm-stat {
    text-align: center;
    padding: 8px 4px;
    background: #0f3460;
    border-radius: 8px;
  }
  .cm-stat-num { font-size: 20px; font-weight: 700; color: #7c83fd; line-height: 1; }
  .cm-stat-lbl { font-size: 10px; color: #888; margin-top: 2px; }

  .cm-stat.warn .cm-stat-num { color: #f59e0b; }

  .cm-actions { display: flex; gap: 8px; }

  .cm-btn {
    flex: 1;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: opacity 0.15s;
  }
  .cm-btn:hover { opacity: 0.85; }
  .cm-btn:active { opacity: 0.7; }

  .cm-btn-primary { background: #7c83fd; color: #fff; }
  .cm-btn-secondary { background: #2a2a4c; color: #c8c8e0; }

  .cm-status {
    margin-top: 10px;
    font-size: 11px;
    color: #888;
    text-align: center;
    min-height: 16px;
  }
  .cm-status.ok  { color: #34d399; }
  .cm-status.err { color: #f87171; }

  .cm-reauth-banner {
    margin-top: 10px;
    padding: 8px 10px;
    background: #7c2d12;
    border-radius: 8px;
    font-size: 11px;
    color: #fde68a;
    text-align: center;
  }
  .cm-reauth-banner a { color: #fbbf24; font-weight: 700; }
`;

// ── Highlight CSS injected into page (NOT shadow DOM) ─────────────────────────
const HIGHLIGHT_STYLE_ID = 'cm-highlight-styles';
const HIGHLIGHT_CSS = `
  .cm-low-confidence {
    outline: 2px solid #f59e0b !important;
    outline-offset: 2px !important;
    position: relative;
  }
  .cm-low-confidence-wrap { position: relative; display: inline-block; }

  /* Tooltip */
  .cm-field-tip {
    position: absolute !important;
    top: -28px !important;
    left: 0 !important;
    background: #1a1a2e !important;
    color: #f59e0b !important;
    font-size: 11px !important;
    font-family: -apple-system, sans-serif !important;
    padding: 3px 8px !important;
    border-radius: 4px !important;
    white-space: nowrap !important;
    pointer-events: none !important;
    z-index: 2147483646 !important;
    border: 1px solid #3a3a5c !important;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .cm-low-confidence:hover ~ .cm-field-tip,
  .cm-low-confidence:focus ~ .cm-field-tip { opacity: 1; }

  /* Correction picker popup */
  .cm-picker {
    position: absolute !important;
    z-index: 2147483646 !important;
    background: #1a1a2e !important;
    border: 1px solid #3a3a5c !important;
    border-radius: 8px !important;
    padding: 6px !important;
    min-width: 200px !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6) !important;
    font-family: -apple-system, sans-serif !important;
  }
  .cm-picker-title {
    font-size: 10px !important;
    color: #888 !important;
    padding: 2px 6px 6px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
  }
  .cm-picker-option {
    display: block !important;
    width: 100% !important;
    text-align: left !important;
    background: none !important;
    border: none !important;
    padding: 6px 8px !important;
    font-size: 12px !important;
    color: #c8c8e0 !important;
    cursor: pointer !important;
    border-radius: 4px !important;
  }
  .cm-picker-option:hover { background: #2a2a4c !important; color: #7c83fd !important; }
  .cm-picker-close { color: #f87171 !important; }
`;

// ── Panel creation ────────────────────────────────────────────────────────────
export function createPanel(opts: {
    onRerun: () => void;
    onSaveCorrection: (fp: string, key: string) => void;
}) {
    _onRerun = opts.onRerun;
    _onSaveCorrection = opts.onSaveCorrection;

    // Only one panel at a time
    if (panelHost) return;

    panelHost = document.createElement('div');
    panelHost.id = 'cm-autofill-host';
    shadowRoot = panelHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadowRoot.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'cm-panel';
    panel.innerHTML = `
    <div class="cm-header">
      <span class="cm-logo">🤖 CandidateMatch</span>
      <button class="cm-close" title="Close">✕</button>
    </div>
    <div class="cm-body">
      <div class="cm-stats">
        <div class="cm-stat" id="cm-s-detected">
          <div class="cm-stat-num" id="cm-n-detected">–</div>
          <div class="cm-stat-lbl">Detected</div>
        </div>
        <div class="cm-stat" id="cm-s-filled">
          <div class="cm-stat-num" id="cm-n-filled">–</div>
          <div class="cm-stat-lbl">Filled</div>
        </div>
        <div class="cm-stat warn" id="cm-s-review">
          <div class="cm-stat-num" id="cm-n-review">–</div>
          <div class="cm-stat-lbl">Review</div>
        </div>
      </div>
      <div class="cm-actions">
        <button class="cm-btn cm-btn-primary"   id="cm-btn-rerun">🔄 Re-run</button>
        <button class="cm-btn cm-btn-secondary" id="cm-btn-save">💾 Save corrections</button>
      </div>
      <div class="cm-status" id="cm-status-msg"></div>
    </div>
  `;
    shadowRoot.appendChild(panel);
    document.documentElement.appendChild(panelHost);

    // Wire up close
    panel.querySelector('.cm-close')!.addEventListener('click', () => destroyPanel());

    // Wire up re-run
    panel.querySelector('#cm-btn-rerun')!.addEventListener('click', () => _onRerun?.());

    // Wire up save corrections
    panel.querySelector('#cm-btn-save')!.addEventListener('click', () => {
        setStatus('Corrections saved!', 'ok');
    });

    // Draggable header
    enableDrag(panel.querySelector('.cm-header') as HTMLElement, panel);

    // Inject highlight styles into the main document
    injectHighlightStyles();
}

export function updatePanel(detected: number, filled: number, lowConf: number) {
    if (!shadowRoot) return;
    (shadowRoot.getElementById('cm-n-detected') as HTMLElement).textContent = String(detected);
    (shadowRoot.getElementById('cm-n-filled') as HTMLElement).textContent = String(filled);
    (shadowRoot.getElementById('cm-n-review') as HTMLElement).textContent = String(lowConf);
}

export function setStatus(msg: string, type: 'ok' | 'err' | 'info' = 'info') {
    if (!shadowRoot) return;
    const el = shadowRoot.getElementById('cm-status-msg') as HTMLElement;
    el.textContent = msg;
    el.className = `cm-status ${type === 'info' ? '' : type}`;
}

export function showReauthBanner(baseUrl: string) {
    if (!shadowRoot) return;
    const body = shadowRoot.querySelector('.cm-body') as HTMLElement;
    // Remove any existing banner
    body.querySelector('.cm-reauth-banner')?.remove();
    const banner = document.createElement('div');
    banner.className = 'cm-reauth-banner';
    banner.innerHTML = `Session expired. <a href="${baseUrl}/connect-extension" target="_blank">Reconnect →</a>`;
    body.appendChild(banner);
}

export function destroyPanel() {
    clearAllHighlights();
    panelHost?.remove();
    panelHost = null;
    shadowRoot = null;
    document.getElementById(HIGHLIGHT_STYLE_ID)?.remove();
}

// ── Field highlights ──────────────────────────────────────────────────────────
function injectHighlightStyles() {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = HIGHLIGHT_CSS;
    document.head.appendChild(style);
}

export function highlightLowConfidence(
    el: HTMLElement,
    fingerprint: string,
    label: string
) {
    el.classList.add('cm-low-confidence');
    el.dataset.cmFingerprint = fingerprint;

    // Tooltip
    const tip = document.createElement('div');
    tip.className = 'cm-field-tip';
    tip.textContent = '⚠ Needs review — click to assign';

    // Wrap in relative-positioned container if not already
    if (el.parentElement && getComputedStyle(el.parentElement).position === 'static') {
        el.parentElement.style.position = 'relative';
    }
    el.insertAdjacentElement('afterend', tip);

    // Click → open correction picker
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        openCorrectionPicker(el, fingerprint, label);
    }, { once: false });
}

export function clearAllHighlights() {
    document.querySelectorAll('.cm-low-confidence').forEach(el => {
        el.classList.remove('cm-low-confidence');
        delete (el as HTMLElement).dataset.cmFingerprint;
        (el as HTMLElement).nextElementSibling?.classList.contains('cm-field-tip') &&
            (el as HTMLElement).nextElementSibling?.remove();
    });
    document.querySelectorAll('.cm-field-tip').forEach(el => el.remove());
    document.querySelectorAll('.cm-picker').forEach(el => el.remove());
}

function openCorrectionPicker(el: HTMLElement, fingerprint: string, fieldLabel: string) {
    // Close any existing picker
    document.querySelectorAll('.cm-picker').forEach(p => p.remove());

    const picker = document.createElement('div');
    picker.className = 'cm-picker';

    const title = document.createElement('div');
    title.className = 'cm-picker-title';
    title.textContent = `Map "${fieldLabel.slice(0, 30)}" to:`;
    picker.appendChild(title);

    for (const key of ALL_PROFILE_KEYS) {
        const btn = document.createElement('button');
        btn.className = 'cm-picker-option';
        btn.textContent = key;
        btn.addEventListener('click', () => {
            _onSaveCorrection?.(fingerprint, key);
            picker.remove();
            // Remove highlight from this field
            el.classList.remove('cm-low-confidence');
            el.nextElementSibling?.classList.contains('cm-field-tip') &&
                el.nextElementSibling?.remove();
        });
        picker.appendChild(btn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cm-picker-option cm-picker-close';
    closeBtn.textContent = '✕ Cancel';
    closeBtn.addEventListener('click', () => picker.remove());
    picker.appendChild(closeBtn);

    // Position below the field
    const rect = el.getBoundingClientRect();
    picker.style.cssText = `
    position: fixed !important;
    top:  ${Math.min(rect.bottom + 6, window.innerHeight - 260)}px !important;
    left: ${Math.max(0, rect.left)}px !important;
  `;
    document.body.appendChild(picker);

    // Close picker on outside click
    const onOutside = (e: MouseEvent) => {
        if (!picker.contains(e.target as Node) && e.target !== el) {
            picker.remove();
            document.removeEventListener('click', onOutside, true);
        }
    };
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
}

// ── Drag helper ───────────────────────────────────────────────────────────────
function enableDrag(handle: HTMLElement, panel: HTMLElement) {
    let startX = 0, startY = 0, startRight = 0, startBottom = 0;

    const onMove = (e: MouseEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.right = `${Math.max(0, startRight - dx)}px`;
        panel.style.bottom = `${Math.max(0, startBottom - dy)}px`;
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
        const style = getComputedStyle(panel);
        startRight = parseInt(style.right, 10) || 20;
        startBottom = parseInt(style.bottom, 10) || 20;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
