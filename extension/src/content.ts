import {
  fetchProfile,
  fetchMappings,
  saveMappings,
  logFillEvent,
  generateCoverLetter,
  type AutofillProfile,
  type FieldMapping,
  type MappingPayload,
} from './api';
import { detectFields, classifyField, type DetectedField } from './autofill/detector';
import { fillField, type ResolvedMapping, profileValueToString } from './autofill/filler';
import { detectAts, type ProfileKey } from './autofill/ats-patterns';
import { extractJobContext } from './ai/job-context';
import {
  createPanel,
  destroyPanel,
  setStatus,
  updateStats,
  renderFieldList,
  showCoverLetterResult,
  setCoverLetterLoading,
  showReauthBanner,
  injectHighlightStyles,
  highlightField,
  type FieldListItem,
} from './ui/panel';

let currentProfile: AutofillProfile | null = null;
let currentMappings: ResolvedMapping[] = [];
let userCorrections: MappingPayload[] = [];
let currentDomain = '';
let currentAts = '';
let panelOpen = false;
const skippedFingerprints = new Set<string>();

function resolveMappings(
  fields: DetectedField[],
  saved: FieldMapping[],
  profile: AutofillProfile
): ResolvedMapping[] {
  const savedMap = new Map(saved.map((m) => [m.field_fingerprint, m]));
  const results: ResolvedMapping[] = [];

  for (const field of fields) {
    if (skippedFingerprints.has(field.fingerprint)) {
      results.push({
        field,
        profileKey: '' as ProfileKey,
        confidence: 0,
        source: 'unknown',
        value: '',
      });
      continue;
    }

    const savedMapping = savedMap.get(field.fingerprint);
    if (savedMapping && savedMapping.confidence >= 50) {
      const rawValue = profile[savedMapping.profile_key];
      const value = profileValueToString(rawValue);
      results.push({
        field,
        profileKey: savedMapping.profile_key as ProfileKey,
        confidence: savedMapping.confidence,
        source: 'saved',
        value,
      });
      continue;
    }

    const heuristic = classifyField(field);
    if (heuristic) {
      const rawValue = profile[heuristic.key];
      const value = profileValueToString(rawValue);
      results.push({
        field,
        profileKey: heuristic.key,
        confidence: heuristic.confidence,
        source: 'heuristic',
        value,
      });
      continue;
    }

    results.push({
      field,
      profileKey: '' as ProfileKey,
      confidence: 0,
      source: 'unknown',
      value: '',
    });
  }

  return results;
}

async function runAutofill(): Promise<void> {
  setStatus('Scanning page…', 'loading');

  currentDomain = window.location.hostname;
  currentAts = detectAts();

  const fields = detectFields();
  if (fields.length === 0) {
    setStatus('No fillable fields found on this page.', 'info');
    updateStats(0, 0, 0, 0);
    return;
  }

  setStatus(`Found ${fields.length} fields — loading profile…`, 'loading');

  const [profileResult, mappingsResult] = await Promise.all([
    currentProfile ? Promise.resolve({ ok: true as const, data: currentProfile }) : fetchProfile(),
    fetchMappings(currentDomain, currentAts),
  ]);

  if (!profileResult.ok) {
    if (profileResult.needsReauth) {
      chrome.storage.local.get('cm_auth_v1', (result) => {
        const auth = result['cm_auth_v1'];
        const connectUrl = auth?.baseUrl
          ? `${auth.baseUrl}/dashboard/candidate/connect-extension`
          : '/dashboard/candidate/connect-extension';
        showReauthBanner(connectUrl);
      });
    }
    setStatus('Could not load profile. Please reconnect.', 'err');
    return;
  }

  currentProfile = profileResult.data;
  const savedMappings = mappingsResult.ok ? mappingsResult.data.mappings : [];

  currentMappings = resolveMappings(fields, savedMappings, currentProfile);

  injectHighlightStyles();
  let filled = 0;
  let review = 0;
  const fieldListItems: FieldListItem[] = [];

  for (const mapping of currentMappings) {
    const { field, confidence, source, value } = mapping;
    const displayLabel = field.label || field.name || field.id || field.type;

    if (skippedFingerprints.has(field.fingerprint)) {
      fieldListItems.push({ label: displayLabel, fingerprint: field.fingerprint, status: 'skipped' });
      continue;
    }

    if (source === 'unknown' || confidence < 40) {
      highlightField(field.el as HTMLElement, 'review');
      fieldListItems.push({ label: displayLabel, fingerprint: field.fingerprint, status: 'review' });
      review += 1;
      continue;
    }

    if (confidence < 70) {
      const ok = fillField(mapping);
      if (ok) {
        filled += 1;
        highlightField(field.el as HTMLElement, 'review');
        fieldListItems.push({ label: displayLabel, fingerprint: field.fingerprint, status: 'review' });
        review += 1;
      } else {
        fieldListItems.push({ label: displayLabel, fingerprint: field.fingerprint, status: 'skipped' });
      }
      continue;
    }

    const ok = fillField(mapping);
    if (ok) {
      filled += 1;
      highlightField(field.el as HTMLElement, 'filled');
      fieldListItems.push({ label: displayLabel, fingerprint: field.fingerprint, status: 'filled' });
    } else {
      fieldListItems.push({ label: displayLabel, fingerprint: field.fingerprint, status: 'skipped' });
    }
  }

  const timeSaved = filled * 8;
  updateStats(fields.length, filled, review, timeSaved);
  renderFieldList(fieldListItems);
  setStatus(
    filled > 0
      ? `✓ Filled ${filled} of ${fields.length} fields${review > 0 ? ` · ${review} need review` : ''}`
      : 'No matching fields found',
    filled > 0 ? 'ok' : 'info'
  );

  const toSave: MappingPayload[] = currentMappings
    .filter((m) => m.source === 'heuristic' && m.confidence >= 70 && m.profileKey)
    .map((m) => ({
      field_fingerprint: m.field.fingerprint,
      field_label: m.field.label,
      field_meta: { name: m.field.name, id: m.field.id, type: m.field.type },
      profile_key: m.profileKey,
      confidence: m.confidence,
    }));

  if (toSave.length > 0) {
    saveMappings(currentDomain, currentAts, toSave).catch(() => {});
  }

  logFillEvent({
    domain: currentDomain,
    atsType: currentAts,
    pageUrl: window.location.href.slice(0, 2048),
    detectedFields: fields.length,
    filledFields: filled,
    lowConfidenceFields: review,
    correctionsCount: userCorrections.length,
  });
}

async function handleCoverLetter(): Promise<void> {
  setCoverLetterLoading(true);
  const ctx = extractJobContext();
  const result = await generateCoverLetter({
    jobTitle: ctx.jobTitle,
    company: ctx.company,
    jobDescription: ctx.jobDescription.slice(0, 2000),
  });

  if (!result.ok) {
    setStatus('Cover letter generation failed.', 'err');
    setCoverLetterLoading(false);
    return;
  }

  showCoverLetterResult(result.data.cover_letter);
  setCoverLetterLoading(false);

  if (currentProfile && currentMappings.length > 0) {
    const clMapping = currentMappings.find(
      (m) => m.profileKey === 'defaultPitch' || (m.field.label && m.field.label.includes('cover letter'))
    );
    if (clMapping) {
      const updated: ResolvedMapping = { ...clMapping, value: result.data.cover_letter };
      fillField(updated);
      setStatus('✓ Cover letter generated and filled', 'ok');
    }
  }
}

function handleCorrection(fingerprint: string, profileKey: ProfileKey): void {
  const mapping = currentMappings.find((m) => m.field.fingerprint === fingerprint);
  if (!mapping || !currentProfile) return;

  mapping.profileKey = profileKey;
  mapping.confidence = 95;
  mapping.source = 'saved';
  mapping.value = profileValueToString(currentProfile[profileKey]);
  fillField(mapping);
  highlightField(mapping.field.el as HTMLElement, 'filled');

  const items: FieldListItem[] = currentMappings.map((m) => ({
    label: m.field.label || m.field.name || m.field.type,
    fingerprint: m.field.fingerprint,
    status: skippedFingerprints.has(m.field.fingerprint)
      ? 'skipped'
      : (m.confidence >= 70 ? 'filled' : 'review'),
  }));
  renderFieldList(items);
  setStatus(`Saved: "${mapping.field.label}" → ${profileKey}`, 'ok');

  const correction: MappingPayload = {
    field_fingerprint: fingerprint,
    field_label: mapping.field.label,
    field_meta: { name: mapping.field.name, id: mapping.field.id, type: mapping.field.type },
    profile_key: profileKey,
    confidence: 95,
  };
  userCorrections = [...userCorrections.filter((c) => c.field_fingerprint !== fingerprint), correction];
  saveMappings(currentDomain, currentAts, [correction]).catch(() => {});
}

function handleSkipField(fingerprint: string): void {
  skippedFingerprints.add(fingerprint);
  const mapping = currentMappings.find((m) => m.field.fingerprint === fingerprint);
  if (mapping) {
    mapping.field.el.classList.remove('cm-field-filled', 'cm-field-review');
  }
  const items: FieldListItem[] = currentMappings.map((m) => ({
    label: m.field.label || m.field.name || m.field.type,
    fingerprint: m.field.fingerprint,
    status: skippedFingerprints.has(m.field.fingerprint)
      ? 'skipped'
      : (m.confidence >= 70 ? 'filled' : 'review'),
  }));
  renderFieldList(items);
}

function checkForConnectToken(): void {
  const el = document.getElementById('cm-ext-token') as HTMLElement | null;
  if (!el || el.dataset.cmProcessed === '1') return;
  const token = el.dataset.token || '';
  const expiry = Number(el.dataset.expiry || 0);
  const baseUrl = (el.dataset.baseUrl || window.location.origin).replace(/\/$/, '');
  if (!token || !expiry) return;
  el.dataset.cmProcessed = '1';
  chrome.storage.local.set(
    { cm_auth_v1: { token, expiry, baseUrl }, cm_base_url: baseUrl },
    () => document.dispatchEvent(new CustomEvent('cm:connected', { detail: { baseUrl } }))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-start detection
// ─────────────────────────────────────────────────────────────────────────────

let autoStarted = false;
let panelReady = false;

function ensurePanel(): void {
  if (!panelReady) {
    createPanel({
      atsType: detectAts(),
      onRerun: () => runAutofill(),
      onCoverLetter: handleCoverLetter,
      onCorrection: handleCorrection,
      onSkipField: handleSkipField,
    });
    panelReady = true;
  }
}

/** Score this page. Returns true if it looks like a job application page. */
function isJobApplicationPage(): boolean {
  let score = 0;
  const url = window.location.href.toLowerCase();
  const host = window.location.hostname.toLowerCase();
  const title = document.title.toLowerCase();

  const jobUrlPatterns = [
    '/apply',
    '/application',
    '/job-application',
    '/submit-application',
    '/jobs/',
    '/careers/',
    '/candidate',
    '/recruiting',
  ];
  if (jobUrlPatterns.some((p) => url.includes(p))) score += 2;

  const jobQueryParams = ['?job=', '?jobid=', '?gh_jid=', '?lever-', '?ref=jobs', 'job_id=', 'jobid='];
  if (jobQueryParams.some((p) => url.includes(p))) score += 2;

  const atsHosts = [
    'greenhouse.io',
    'lever.co',
    'myworkdayjobs.com',
    'workday.com',
    'icims.com',
    'smartrecruiters.com',
    'taleo.net',
    'ashbyhq.com',
    'bamboohr.com',
    'workable.com',
    'jobvite.com',
    'jazzhr.com',
    'successfactors.com',
    'oraclecloud.com',
    'sapsf.com',
  ];
  if (atsHosts.some((h) => host.includes(h))) score += 3;

  const forms = document.querySelectorAll('form');
  // eslint-disable-next-line no-restricted-syntax
  for (const form of forms) {
    const fillableInputs = form.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea, select'
    );
    if (fillableInputs.length >= 3) {
      score += 2;
      break;
    }
  }

  if (forms.length === 0) {
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], textarea'
    );
    if (inputs.length >= 3) score += 2;
  }

  const atsSelectors = [
    '[data-automation-id="submitButton"]',
    '#application_form',
    '.application-form',
    '[class*="apply-form"]',
    '[class*="job-application"]',
    '[class*="application-form"]',
    '.lever-apply',
    '[data-qa="btn-apply"]',
    '#apply-form',
    '[id*="application"]',
    '[class*="applyForm"]',
  ];
  if (atsSelectors.some((sel) => document.querySelector(sel))) score += 3;

  const applyKeywords = ['apply', 'application', 'submit your application', 'job application'];
  if (applyKeywords.some((k) => title.includes(k))) score += 1;

  const h1 = document.querySelector('h1')?.textContent?.toLowerCase() || '';
  if (applyKeywords.some((k) => h1.includes(k))) score += 1;

  return score >= 2;
}

/** Main auto-start entry point — called after page load */
async function tryAutoStart(): Promise<void> {
  if (autoStarted) return;

  const auth = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get('cm_auth_v1', (result) => resolve(result as Record<string, unknown>));
  });
  const stored = auth.cm_auth_v1 as { token?: string; expiry?: number } | undefined;
  if (!stored?.token || typeof stored.expiry !== 'number' || Date.now() > stored.expiry - 30_000) return;

  if (!isJobApplicationPage()) return;

  autoStarted = true;
  ensurePanel();
  await runAutofill();
}

/** Watch for SPA navigation — forms may load after initial page render */
function watchForFormAppearance(): void {
  if (autoStarted) return;

  let watchTimeout: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (autoStarted) {
      observer.disconnect();
      return;
    }
    if (watchTimeout) clearTimeout(watchTimeout);
    watchTimeout = setTimeout(async () => {
      if (!autoStarted && isJobApplicationPage()) {
        observer.disconnect();
        autoStarted = true;
        ensurePanel();
        await runAutofill();
      }
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => {
    observer.disconnect();
    if (watchTimeout) clearTimeout(watchTimeout);
  }, 8_000);
}

// Manual activation / URL change listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'CM_ACTIVATE') {
    ensurePanel();
    autoStarted = true;
    void runAutofill();
    return;
  }
  if (msg?.type === 'CM_URL_CHANGED') {
    autoStarted = false;
    panelReady = false;
    setTimeout(() => {
      void tryAutoStart();
    }, 1_000);
  }
});

function pollForToken(): void {
  checkForConnectToken();
  const observer = new MutationObserver(() => checkForConnectToken());
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10_000);
}

async function boot(): Promise<void> {
  pollForToken();

  if (document.readyState === 'complete') {
    setTimeout(() => {
      void tryAutoStart();
      watchForFormAppearance();
    }, 800);
  } else {
    window.addEventListener(
      'load',
      () => {
        setTimeout(() => {
          void tryAutoStart();
          watchForFormAppearance();
        }, 800);
      },
      { once: true }
    );
  }
}

void boot();

