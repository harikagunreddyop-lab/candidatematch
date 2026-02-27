/**
 * content.ts — Main content script for CandidateMatch Autofill Extension.
 *
 * Injected into every page. Dormant until activated via:
 *   a) Keyboard shortcut (Ctrl+Shift+F) forwarded from background.ts
 *   b) CM_ACTIVATE message from background.ts
 *
 * SAFETY GUARANTEES (cannot be overridden):
 *   ✗ Never fills password fields
 *   ✗ Never clicks submit / triggers form.submit()
 *   ✗ Never bypasses CAPTCHA
 *   ✗ Never auto-submits anything
 *   ✓ Only fills: text, email, tel, url, number, textarea, select, radio, checkbox
 *   ✓ Radio/checkbox only filled at confidence >= 80
 */

import { fetchProfile, fetchMappings, saveMappings, logFillEvent, AutofillProfile, FieldMapping, MappingPayloadItem } from './api';
import { createPanel, updatePanel, setStatus, destroyPanel, highlightLowConfidence, clearAllHighlights, showReauthBanner } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface DetectedField {
    el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    label: string;
    name: string;
    id: string;
    type: string;   // input type or 'select' or 'textarea'
    required: boolean;
    options: string[]; // select options or radio group values
    selector: string;   // CSS selector for re-identification
    snippet: string;   // surrounding text context (for debug/logging)
    fingerprint: string;   // stable djb2 hash
}

interface ResolvedMapping {
    field: DetectedField;
    profileKey: string;
    confidence: number;
    source: 'saved' | 'heuristic' | 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// djb2 hash — no external deps, produces stable 8-hex fingerprint
// ─────────────────────────────────────────────────────────────────────────────
function djb2(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
    return (h >>> 0).toString(16).padStart(8, '0');
}

function fingerprint(f: Omit<DetectedField, 'fingerprint' | 'el' | 'snippet' | 'selector'>): string {
    return djb2([f.label, f.name, f.id, f.type, f.options.join(',')].join('|').toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// ATS Detection
// ─────────────────────────────────────────────────────────────────────────────
function detectAtsType(): string {
    const host = window.location.hostname.toLowerCase();
    const href = window.location.href.toLowerCase();

    if (host.includes('myworkdayjobs.com') || host.includes('workday.com') ||
        document.querySelector('[data-automation-id]')) return 'workday';

    if (host.includes('greenhouse.io') ||
        document.querySelector('#application_form, #board_company_name')) return 'greenhouse';

    if (host.includes('lever.co') ||
        document.querySelector('[name^="lever-"], .lever-apply')) return 'lever';

    if (host.includes('icims.com') ||
        href.includes('icims')) return 'icims';

    if (host.includes('smartrecruiters.com') ||
        document.querySelector('.smart-apply, #main-form')) return 'smartrecruiters';

    if (host.includes('taleo.net') ||
        document.querySelector('.taleo-form, #FLUserFName')) return 'taleo';

    return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Label resolution
// ─────────────────────────────────────────────────────────────────────────────
function resolveLabel(el: Element): string {
    const id = el.getAttribute('id');

    // 1. <label for="id">
    if (id) {
        const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.textContent?.trim() ?? '';
    }

    // 2. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // 3. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const ids = labelledBy.split(/\s+/);
        const text = ids.map(lid => document.getElementById(lid)?.textContent?.trim() ?? '').join(' ');
        if (text) return text;
    }

    // 4. placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();

    // 5. Closest label ancestor
    const parentLabel = el.closest('label');
    if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input,select,textarea').forEach(n => n.remove());
        const text = clone.textContent?.trim();
        if (text) return text;
    }

    // 6. Preceding sibling or parent text node
    const parent = el.parentElement;
    if (parent) {
        // Look for a nearby text node
        const prev = el.previousElementSibling;
        if (prev && ['LABEL', 'SPAN', 'DIV', 'P', 'LEGEND'].includes(prev.tagName)) {
            const t = prev.textContent?.trim();
            if (t) return t;
        }
        // Walk up one level
        const grandParent = parent.parentElement;
        if (grandParent) {
            const prevSib = parent.previousElementSibling;
            if (prevSib) {
                const t = prevSib.textContent?.trim();
                if (t && t.length < 80) return t;
            }
        }
    }

    // 7. name or id as fallback
    return (el.getAttribute('name') || el.getAttribute('id') || '').replace(/[_-]/g, ' ').trim();
}

function getSnippet(el: Element): string {
    return (el.closest('fieldset, .form-group, .form-field, .field-row, div, li')
        ?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Field detection
// ─────────────────────────────────────────────────────────────────────────────
const SAFE_INPUT_TYPES = new Set([
    'text', 'email', 'tel', 'url', 'number', 'search', 'date', 'month', 'week',
]);
const SKIP_INPUT_TYPES = new Set([
    'password', 'hidden', 'submit', 'reset', 'button', 'image', 'file',
]);

function cssSelector(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList).slice(0, 2).join('.');
    const name = el.getAttribute('name');
    if (name) return `${tag}[name="${CSS.escape(name)}"]`;
    if (cls) return `${tag}.${cls}`;
    return tag;
}

function detectFields(): DetectedField[] {
    const seen = new Set<string>();
    const fields: DetectedField[] = [];

    const candidates = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]):not([type="image"]):not([type="file"]), select, textarea'
        )
    );

    for (const el of candidates) {
        if ((el as HTMLInputElement).type === 'password') continue;
        if ((el as HTMLInputElement).type === 'hidden') continue;

        // Skip CAPTCHA iframes / google recaptcha / hcaptcha
        const outerHtml = el.outerHTML.toLowerCase();
        if (outerHtml.includes('captcha') || outerHtml.includes('recaptcha')) continue;

        // Skip invisible elements
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const tag = el.tagName.toLowerCase();
        const type = tag === 'input' ? ((el as HTMLInputElement).type || 'text') : tag;

        if (SKIP_INPUT_TYPES.has(type)) continue;

        // For radio/checkbox: group by name
        if (type === 'radio' || type === 'checkbox') {
            const groupKey = `${type}:${el.getAttribute('name') || el.getAttribute('id') || outerHtml.slice(0, 40)}`;
            if (seen.has(groupKey)) continue;
            seen.add(groupKey);
        }

        const label = resolveLabel(el);
        const name = el.getAttribute('name') || '';
        const id = el.getAttribute('id') || '';
        const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';

        let options: string[] = [];
        if (tag === 'select') {
            options = Array.from((el as HTMLSelectElement).options)
                .map(o => o.text.trim())
                .filter(t => t.length > 0 && t !== '--' && !t.startsWith('-'));
        } else if (type === 'radio') {
            options = Array.from(
                document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)
            ).map(r => r.value || resolveLabel(r));
        }

        const fp = fingerprint({ label, name, id, type, required, options });
        const sel = cssSelector(el);

        if (seen.has(fp)) continue;
        seen.add(fp);

        fields.push({
            el: el as any,
            label, name, id, type, required, options,
            selector: sel,
            snippet: getSnippet(el),
            fingerprint: fp,
        });
    }

    return fields;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic heuristic mapping engine
// ─────────────────────────────────────────────────────────────────────────────
interface Heuristic {
    patterns: RegExp[];
    profileKey: string;
    confidence: number;
}

const HEURISTICS: Heuristic[] = [
    // Contact
    { patterns: [/\bfirst[\s_-]?name\b|fname|forename|given[\s_-]?name/i], profileKey: 'firstName', confidence: 88 },
    { patterns: [/\blast[\s_-]?name\b|lname|surname|family[\s_-]?name/i], profileKey: 'lastName', confidence: 88 },
    { patterns: [/\bfull[\s_-]?name\b/i], profileKey: 'fullName', confidence: 80 },
    { patterns: [/\bname\b/i], profileKey: 'fullName', confidence: 60 },
    { patterns: [/\be[\s_-]?mail\b/i], profileKey: 'email', confidence: 92 },
    { patterns: [/\bphone\b|mobile|cell[\s_-]?phone|\btel\b|telephone/i], profileKey: 'phone', confidence: 88 },

    // Address
    { patterns: [/\baddress[\s_-]?line\s*1?\b|street[\s_-]?(address)?\b/i], profileKey: 'location', confidence: 75 },
    { patterns: [/\bcity\b/i], profileKey: 'city', confidence: 90 },
    { patterns: [/\bstate\b|\bprovince\b/i], profileKey: 'state', confidence: 85 },
    { patterns: [/zip|postal[\s_-]?code|post[\s_-]?code/i], profileKey: 'zipCode', confidence: 88 },
    { patterns: [/\bcountry\b/i], profileKey: 'country', confidence: 85 },

    // Professional profiles
    { patterns: [/linkedin/i], profileKey: 'linkedinUrl', confidence: 95 },
    { patterns: [/github/i], profileKey: 'githubUrl', confidence: 92 },
    { patterns: [/\bportfolio\b|personal[\s_-]?site|website[\s_-]?url|personal[\s_-]?url/i], profileKey: 'portfolioUrl', confidence: 85 },

    // Work info
    { patterns: [/current[\s_-]?title|job[\s_-]?title|\btitle\b|position|role\b/i], profileKey: 'currentTitle', confidence: 78 },
    { patterns: [/current[\s_-]?company|employer|organization|company[\s_-]?name/i], profileKey: 'currentCompany', confidence: 78 },
    { patterns: [/years[\s_-]?of[\s_-]?exp|experience[\s_-]?year|how[\s_-]?many[\s_-]?year/i], profileKey: 'yearsExperience', confidence: 82 },

    // Education
    { patterns: [/\bschool\b|\buniversity\b|\bcollege\b|institution/i], profileKey: 'school', confidence: 82 },
    { patterns: [/\bdegree\b|highest[\s_-]?education|education[\s_-]?level/i], profileKey: 'degree', confidence: 82 },
    { patterns: [/\bmajor\b|field[\s_-]?of[\s_-]?study|area[\s_-]?of[\s_-]?study|concentration/i], profileKey: 'major', confidence: 82 },
    { patterns: [/graduation[\s_-]?date|grad[\s_-]?year|expected[\s_-]?graduation/i], profileKey: 'graduationDate', confidence: 82 },

    // Salary / compensation
    { patterns: [/salary[\s_-]?expect|desired[\s_-]?salary|expected[\s_-]?(comp|pay|salary)|compensation[\s_-]?expect/i], profileKey: 'salaryExpectation', confidence: 78 },
    { patterns: [/salary[\s_-]?min|minimum[\s_-]?salary/i], profileKey: 'salaryMin', confidence: 80 },
    { patterns: [/salary[\s_-]?max|maximum[\s_-]?salary/i], profileKey: 'salaryMax', confidence: 80 },

    // Work preferences
    { patterns: [/start[\s_-]?date|available[\s_-]?to[\s_-]?start|when[\s_-]?can[\s_-]?you[\s_-]?start|earliest[\s_-]?start/i], profileKey: 'availability', confidence: 82 },
    { patterns: [/reloc|willing[\s_-]?to[\s_-]?(move|relocate)/i], profileKey: 'openToRelocate', confidence: 78 },
    { patterns: [/remote|work[\s_-]?from[\s_-]?home|wfh/i], profileKey: 'openToRemote', confidence: 78 },

    // Work authorization (these appear as yes/no radio groups most often)
    { patterns: [/authorized[\s_-]?to[\s_-]?work|legally[\s_-]?authorized|eligible[\s_-]?to[\s_-]?work|work[\s_-]?auth/i], profileKey: 'authorizedToWork', confidence: 88 },
    { patterns: [/sponsor|require[\s_-]?sponsor|visa[\s_-]?sponsor|need[\s_-]?sponsor|immigration[\s_-]?sponsor/i], profileKey: 'requiresSponsorship', confidence: 88 },
    { patterns: [/visa[\s_-]?status|\bvisa\b|work[\s_-]?permit|\bcitizenship\b|immigration[\s_-]?status/i], profileKey: 'visaStatus', confidence: 75 },

    // Free text
    { patterns: [/cover[\s_-]?letter|additional[\s_-]?info|tell[\s_-]?us[\s_-]?about|pitch/i], profileKey: 'defaultPitch', confidence: 72 },
    { patterns: [/\bsummary\b|professional[\s_-]?summary|about[\s_-]?yourself|background/i], profileKey: 'summary', confidence: 72 },
    { patterns: [/\bskills?\b|technical[\s_-]?skills|core[\s_-]?competencie/i], profileKey: 'skills', confidence: 72 },
];

function applyHeuristic(field: DetectedField): { profileKey: string; confidence: number } | null {
    const haystack = `${field.label} ${field.name} ${field.id}`.toLowerCase();
    for (const h of HEURISTICS) {
        if (h.patterns.some(p => p.test(haystack))) {
            return { profileKey: h.profileKey, confidence: h.confidence };
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping engine: saved > heuristic > unknown
// ─────────────────────────────────────────────────────────────────────────────
function resolveMappings(
    fields: DetectedField[],
    savedMappings: FieldMapping[],
): ResolvedMapping[] {
    const savedMap = new Map(savedMappings.map(m => [m.field_fingerprint, m]));

    return fields.map(field => {
        // 1. Saved mapping (highest priority — user-validated)
        const saved = savedMap.get(field.fingerprint);
        if (saved) {
            return { field, profileKey: saved.profile_key, confidence: saved.confidence, source: 'saved' as const };
        }

        // 2. Deterministic heuristic
        const h = applyHeuristic(field);
        if (h) {
            return { field, profileKey: h.profileKey, confidence: h.confidence, source: 'heuristic' as const };
        }

        // 3. Unknown — do NOT guess
        return { field, profileKey: '', confidence: 0, source: 'unknown' as const };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fill engine
// ─────────────────────────────────────────────────────────────────────────────

/** React-compatible setter that triggers synthetic events. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) {
        desc.set.call(el, value);
    } else {
        el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function fillSelect(el: HTMLSelectElement, value: string): boolean {
    if (!value) return false;
    const norm = value.toLowerCase().trim();

    // Try option value match
    for (const opt of Array.from(el.options)) {
        if (opt.value.toLowerCase() === norm) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
    }
    // Try option text exact
    for (const opt of Array.from(el.options)) {
        if (opt.text.toLowerCase().trim() === norm) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
    }
    // Synonym / starts-with
    const synonyms: Record<string, string[]> = {
        'yes': ['y', 'true', 'yes', 'si'],
        'no': ['n', 'false', 'no'],
        'united states': ['us', 'usa', 'united states of america', 'u.s.'],
        'bachelor': ["bachelor's", "bachelor's degree", 'bs', 'ba', 'b.s.'],
        'master': ["master's", "master's degree", 'ms', 'ma', 'm.s.'],
        'phd': ['ph.d.', 'doctorate', 'doctoral'],
    };
    const expanded = [norm];
    for (const [k, variants] of Object.entries(synonyms)) {
        if (variants.includes(norm) || norm === k) expanded.push(...variants, k);
    }
    for (const opt of Array.from(el.options)) {
        const t = opt.text.toLowerCase().trim();
        if (expanded.some(x => t.startsWith(x) || t.includes(x))) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
    }
    return false;
}

function fillRadioGroup(name: string, value: string, confidence: number): boolean {
    if (confidence < 80) return false; // Safety gate
    if (!value) return false;

    const radios = Array.from(
        document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)
    );
    if (radios.length === 0) return false;

    const norm = value.toString().toLowerCase().trim();
    // Common boolean-ish values
    const yesValues = new Set(['yes', 'true', '1', 'y', 'authorized', 'no sponsorship required']);
    const noValues = new Set(['no', 'false', '0', 'n', 'unauthorized', 'requires sponsorship']);

    const isYes = norm === 'true' || yesValues.has(norm);
    const isNo = norm === 'false' || noValues.has(norm);

    for (const radio of radios) {
        const rv = (radio.value || resolveLabel(radio)).toLowerCase().trim();
        let match = rv === norm || rv.startsWith(norm) || norm.startsWith(rv);
        if (!match && isYes && yesValues.has(rv)) match = true;
        if (!match && isNo && noValues.has(rv)) match = true;

        if (match) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            radio.dispatchEvent(new Event('click', { bubbles: true }));
            return true;
        }
    }
    return false;
}

function fillCheckbox(el: HTMLInputElement, value: string, confidence: number): boolean {
    if (confidence < 80) return false;
    const shouldCheck = value === 'true' || value === '1' || value === 'yes';
    if (el.checked !== shouldCheck) {
        el.checked = shouldCheck;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('click', { bubbles: true }));
    }
    return true;
}

/** Convert profile value to a string appropriate for the field type. */
function profileValueToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

/** Returns true if actually filled. */
function fillField(mapping: ResolvedMapping, profile: AutofillProfile): boolean {
    const { field, profileKey, confidence } = mapping;
    if (!profileKey || confidence === 0) return false;

    const rawValue = profile[profileKey];
    if (rawValue === undefined || rawValue === null || rawValue === '') return false;

    const value = profileValueToString(rawValue);

    const { el } = field;

    // Safety: never touch password or submit
    if (field.type === 'password' || field.type === 'submit' || field.type === 'reset') return false;

    try {
        if (field.type === 'select') {
            return fillSelect(el as HTMLSelectElement, value);
        }

        if (field.type === 'radio') {
            return fillRadioGroup(field.name, value, confidence);
        }

        if (field.type === 'checkbox') {
            return fillCheckbox(el as HTMLInputElement, value, confidence);
        }

        // text, email, tel, url, number, textarea, search, date
        setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, value);
        return true;

    } catch {
        // Filling failed (e.g. element was removed mid-fill) — silently skip
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let currentProfile: AutofillProfile | null = null;
let currentFields: DetectedField[] = [];
let currentMappings: ResolvedMapping[] = [];
let currentDomain: string = '';
let currentAts: string = '';
let userCorrections: MappingPayloadItem[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Main autofill run
// ─────────────────────────────────────────────────────────────────────────────
async function runAutofill() {
    setStatus('Scanning…', 'info');

    currentDomain = window.location.hostname;
    currentAts = detectAtsType();

    // Detect fields
    currentFields = detectFields();
    const detected = currentFields.length;

    if (detected === 0) {
        setStatus('No fillable fields found on this page.', 'info');
        updatePanel(0, 0, 0);
        return;
    }

    setStatus(`Found ${detected} fields. Fetching profile…`, 'info');

    // Fetch profile + mappings in parallel
    const [profileResult, mappingsResult] = await Promise.all([
        currentProfile ? Promise.resolve({ ok: true as const, data: currentProfile }) : fetchProfile(),
        fetchMappings(currentDomain, currentAts),
    ]);

    if (!profileResult.ok) {
        if ((profileResult as any).needsReauth) showReauthBanner(`${window.location.origin}/dashboard/candidate/connect-extension`);
        setStatus('Could not load profile. Reconnect extension.', 'err');
        return;
    }

    currentProfile = profileResult.data;
    const savedMappings = mappingsResult.ok ? mappingsResult.data.mappings : [];

    // Resolve mappings
    currentMappings = resolveMappings(currentFields, savedMappings);

    // Fill fields
    clearAllHighlights();
    let filled = 0;
    let lowConf = 0;

    for (const mapping of currentMappings) {
        const { field, confidence, source } = mapping;

        if (source === 'unknown' || confidence < 40) {
            // Low confidence — highlight but don't fill
            highlightLowConfidence(field.el, field.fingerprint, field.label);
            lowConf++;
            continue;
        }

        if (confidence < 70) {
            // Fill but also highlight for review
            const ok = fillField(mapping, currentProfile);
            if (ok) filled++;
            highlightLowConfidence(field.el, field.fingerprint, field.label);
            lowConf++;
            continue;
        }

        const ok = fillField(mapping, currentProfile);
        if (ok) filled++;
    }

    updatePanel(detected, filled, lowConf);
    setStatus(`Done — ${filled}/${detected} filled.`, 'ok');

    // Log telemetry (fire-and-forget)
    logFillEvent({
        domain: currentDomain,
        atsType: currentAts,
        pageUrl: window.location.href.slice(0, 2048),
        detectedFields: detected,
        filledFields: filled,
        lowConfidenceFields: lowConf,
        correctionsCount: userCorrections.length,
    });

    // Save heuristic mappings back so we learn over time (only confirmed heuristics)
    const heuristicMappings: MappingPayloadItem[] = currentMappings
        .filter(m => m.source === 'heuristic' && m.confidence >= 70)
        .map(m => ({
            field_fingerprint: m.field.fingerprint,
            field_label: m.field.label,
            field_meta: { name: m.field.name, id: m.field.id, type: m.field.type },
            profile_key: m.profileKey,
            confidence: m.confidence,
        }));

    if (heuristicMappings.length > 0) {
        saveMappings(currentDomain, currentAts, heuristicMappings).catch(() => {/* silent */ });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Correction handler (user picks a profile key from the correction picker)
// ─────────────────────────────────────────────────────────────────────────────
function handleCorrection(fingerprint: string, profileKey: string) {
    const mapping = currentMappings.find(m => m.field.fingerprint === fingerprint);
    if (!mapping) return;

    // Apply the correction immediately
    mapping.profileKey = profileKey;
    mapping.confidence = 85;
    mapping.source = 'saved';

    if (currentProfile) {
        fillField(mapping, currentProfile);
    }

    // Queue correction for batch save
    const correction: MappingPayloadItem = {
        field_fingerprint: fingerprint,
        field_label: mapping.field.label,
        field_meta: { name: mapping.field.name, id: mapping.field.id, type: mapping.field.type },
        profile_key: profileKey,
        confidence: 95, // user-confirmed → max confidence
    };
    userCorrections = [...userCorrections.filter(c => c.field_fingerprint !== fingerprint), correction];

    // Save immediately
    saveMappings(currentDomain, currentAts, [correction]).catch(() => {/* silent */ });

    setStatus(`Saved: "${mapping.field.label}" → ${profileKey}`, 'ok');
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect-extension token handler
// ─────────────────────────────────────────────────────────────────────────────
// Content scripts have direct chrome.storage access — no background roundtrip.
// MV3 service workers can be killed at any time, so we NEVER depend on them
// being alive for this critical path.
function checkForConnectToken() {
    const tokenEl = document.getElementById('cm-ext-token') as HTMLElement | null;
    if (!tokenEl) return;

    const token = tokenEl.dataset.token || '';
    const expiry = Number(tokenEl.dataset.expiry || 0);
    const baseUrl = (tokenEl.dataset.baseUrl || window.location.origin).replace(/\/$/, '');

    if (!token || !expiry) return;

    // Mark element as processed so MutationObserver doesn't fire twice
    if (tokenEl.dataset.cmProcessed === '1') return;
    tokenEl.dataset.cmProcessed = '1';

    // Store directly — content scripts have chrome.storage access
    chrome.storage.local.set(
        { cm_auth_v1: { token, expiry, baseUrl } },
        () => {
            // Dispatch immediately — page is listening for this event
            document.dispatchEvent(new CustomEvent('cm:connected', { detail: { baseUrl } }));
        }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────
let panelReady = false;

function ensurePanel() {
    if (!panelReady) {
        createPanel({
            onRerun: () => runAutofill(),
            onSaveCorrection: handleCorrection,
        });
        panelReady = true;
    }
}

// Listen for activation from background.ts (keyboard shortcut)
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'CM_ACTIVATE') return;
    ensurePanel();
    runAutofill();
});

// Connect-extension: check for token element on DOM ready + DOM changes
function pollForToken() {
    checkForConnectToken();
    // Also observe DOM mutations (Next.js hydration may delay element rendering)
    const observer = new MutationObserver(() => checkForConnectToken());
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10_000); // stop after 10s
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    pollForToken();
} else {
    window.addEventListener('DOMContentLoaded', pollForToken, { once: true });
}
