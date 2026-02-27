/**
 * api.ts — Authenticated API calls to CandidateMatch backend.
 *
 * All calls include Authorization: Bearer <token>.
 * On 401, sets needsReauth = true so content script can show banner.
 */

import { getStoredAuth, StoredAuth } from './storage';

export interface AutofillProfile {
    fullName: string; firstName: string; lastName: string;
    email: string; phone: string; location: string; city: string; state: string; country: string;
    currentTitle: string; currentCompany: string; yearsExperience: string;
    linkedinUrl: string; githubUrl: string; portfolioUrl: string;
    summary: string; defaultPitch: string; skills: string;
    degree: string; school: string; major: string; graduationDate: string;
    visaStatus: string; authorizedToWork: boolean; requiresSponsorship: boolean;
    salaryMin: string; salaryMax: string; salaryExpectation: string;
    availability: string; openToRemote: boolean; openToRelocate: boolean;
    // Index signature for dynamic profile key access
    [key: string]: string | boolean | number | undefined;
}

export interface FieldMapping {
    field_fingerprint: string;
    field_label: string | null;
    profile_key: string;
    confidence: number;
    use_count: number;
    field_meta: Record<string, unknown>;
}

export interface ResumeItem {
    id: string;
    label: string;
    file_name: string;
    size_bytes: number;
    updated_at: string;
}

// ── Internal ─────────────────────────────────────────────────────────────────

type FetchResult<T> =
    | { ok: true; data: T }
    | { ok: false; status: number; error: string; needsReauth: boolean };

async function apiFetch<T>(
    auth: StoredAuth,
    path: string,
    options: RequestInit = {}
): Promise<FetchResult<T>> {
    const url = `${auth.baseUrl}${path}`;
    const headers: HeadersInit = {
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
    };
    try {
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            return { ok: false, status: res.status, error: 'Session expired', needsReauth: true };
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return { ok: false, status: res.status, error: (body as any)?.error || res.statusText, needsReauth: false };
        }
        const data = await res.json() as T;
        return { ok: true, data };
    } catch (err: any) {
        return { ok: false, status: 0, error: err?.message || 'Network error', needsReauth: false };
    }
}

async function getAuth(): Promise<StoredAuth | null> {
    return getStoredAuth();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchProfile(): Promise<FetchResult<AutofillProfile>> {
    const auth = await getAuth();
    if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
    return apiFetch<AutofillProfile>(auth, '/api/autofill-profile');
}

export async function fetchMappings(domain: string, atsType: string): Promise<FetchResult<{ mappings: FieldMapping[] }>> {
    const auth = await getAuth();
    if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
    const q = new URLSearchParams({ domain, ats: atsType });
    return apiFetch<{ mappings: FieldMapping[] }>(auth, `/api/autofill/mappings?${q}`);
}

export interface MappingPayloadItem {
    field_fingerprint: string;
    field_label: string | null;
    field_meta: Record<string, unknown>;
    profile_key: string;
    confidence: number;
}

export async function saveMappings(
    domain: string, atsType: string, mappings: MappingPayloadItem[]
): Promise<FetchResult<{ saved: number }>> {
    const auth = await getAuth();
    if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
    return apiFetch<{ saved: number }>(auth, '/api/autofill/mappings', {
        method: 'POST',
        body: JSON.stringify({ domain, ats_type: atsType, mappings }),
    });
}

export interface FillEventPayload {
    domain: string; atsType: string; pageUrl: string;
    detectedFields: number; filledFields: number; lowConfidenceFields: number;
    correctionsCount?: number; payload?: Record<string, unknown>;
}

export async function logFillEvent(ev: FillEventPayload): Promise<void> {
    const auth = await getAuth();
    if (!auth) return;
    // Fire-and-forget — telemetry should never block UI
    apiFetch(auth, '/api/autofill/events', {
        method: 'POST',
        body: JSON.stringify({
            domain: ev.domain,
            ats_type: ev.atsType,
            page_url: ev.pageUrl,
            detected_fields: ev.detectedFields,
            filled_fields: ev.filledFields,
            low_confidence_fields: ev.lowConfidenceFields,
            corrections_count: ev.correctionsCount ?? 0,
            payload: ev.payload ?? {},
        }),
    }).catch(() => { /* telemetry failure is silent */ });
}

export async function fetchResumes(): Promise<FetchResult<{ resumes: ResumeItem[] }>> {
    const auth = await getAuth();
    if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
    return apiFetch<{ resumes: ResumeItem[] }>(auth, '/api/autofill/resumes');
}

export async function getResumeSignedUrl(
    resumeId: string
): Promise<FetchResult<{ url: string; file_name: string; expires_in: number }>> {
    const auth = await getAuth();
    if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
    // NOTE: caller must have shown user a confirmation UI before calling this.
    return apiFetch(auth, '/api/autofill/resumes/download', {
        method: 'POST',
        body: JSON.stringify({ resume_id: resumeId, confirmed: true }),
    });
}
