import { getStoredAuth, StoredAuth } from './storage';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutofillProfile {
  fullName: string; firstName: string; lastName: string;
  email: string; phone: string;
  location: string; city: string; state: string; zipCode: string; country: string;
  currentTitle: string; currentCompany: string; yearsExperience: string;
  linkedinUrl: string; githubUrl: string; portfolioUrl: string;
  summary: string; defaultPitch: string; skills: string;
  degree: string; school: string; major: string; graduationDate: string;
  visaStatus: string; authorizedToWork: boolean; requiresSponsorship: boolean;
  salaryMin: string; salaryMax: string; salaryExpectation: string;
  availability: string; openToRemote: boolean; openToRelocate: boolean;
  // EEO fields
  gender: string; ethnicity: string; veteranStatus: string; disabilityStatus: string;
  // Allow arbitrary additional keys
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
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
  id: string; label: string; file_name: string; size_bytes: number; updated_at: string;
}

export interface CoverLetterResult {
  cover_letter: string;
  tone: string;
}

type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; needsReauth: boolean };

// ── Internal fetch ────────────────────────────────────────────────────────────

async function apiFetch<T>(
  auth: StoredAuth,
  path: string,
  options: RequestInit = {}
): Promise<FetchResult<T>> {
  const url = `${auth.baseUrl}${path}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };
  try {
    const res = await fetch(url, { ...options, headers });
    const needsReauth = res.status === 401 || res.status === 403;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        status: res.status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: (body as any)?.error || res.statusText,
        needsReauth,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { ok: false, status: 0, error: message, needsReauth: false };
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

export async function fetchMappings(
  domain: string,
  atsType: string
): Promise<FetchResult<{ mappings: FieldMapping[] }>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
  return apiFetch(auth, `/api/autofill/mappings?${new URLSearchParams({ domain, ats: atsType })}`);
}

export interface MappingPayload {
  field_fingerprint: string;
  field_label: string | null;
  field_meta: Record<string, unknown>;
  profile_key: string;
  confidence: number;
}

export async function saveMappings(
  domain: string,
  atsType: string,
  mappings: MappingPayload[]
): Promise<FetchResult<{ saved: number }>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
  return apiFetch(auth, '/api/autofill/mappings', {
    method: 'POST',
    body: JSON.stringify({ domain, ats_type: atsType, mappings }),
  });
}

export async function logFillEvent(ev: {
  domain: string;
  atsType: string;
  pageUrl: string;
  detectedFields: number;
  filledFields: number;
  lowConfidenceFields: number;
  correctionsCount?: number;
}): Promise<void> {
  const auth = await getAuth();
  if (!auth) return;
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
      payload: {},
    }),
  }).catch(() => {});
}

export async function fetchResumes(): Promise<FetchResult<{ resumes: ResumeItem[] }>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
  return apiFetch(auth, '/api/autofill/resumes');
}

export async function generateCoverLetter(payload: {
  jobTitle: string;
  company: string;
  jobDescription: string;
}): Promise<FetchResult<CoverLetterResult>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, status: 401, error: 'Not connected', needsReauth: true };
  return apiFetch(auth, '/api/autofill/cover-letter', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

