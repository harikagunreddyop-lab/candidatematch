/**
 * Lightweight match score for candidate ↔ job (for search results).
 * Uses profile + job fields only; not the full ATS pipeline.
 */
export interface CandidateForMatch {
  skills?: string[];
  years_of_experience?: number | null;
  primary_title?: string | null;
  location?: string | null;
  open_to_remote?: boolean;
  salary_min?: number | null;
  salary_max?: number | null;
}

export interface JobForMatch {
  title: string;
  location?: string | null;
  remote_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  must_have_skills?: string[] | null;
  nice_to_have_skills?: string[] | null;
  min_years_experience?: number | null;
}

const WEIGHTS = {
  skills: 0.4,
  experience: 0.2,
  location: 0.15,
  salary: 0.15,
  title: 0.1,
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenSet(str: string): Set<string> {
  return new Set(
    str
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 1)
  );
}

/** Title similarity 0–1 (word overlap + exact match boost). */
function titleSimilarity(candidateTitle: string | null | undefined, jobTitle: string): number {
  if (!candidateTitle || !jobTitle) return 0.5;
  const c = tokenSet(candidateTitle);
  const j = tokenSet(jobTitle);
  if (j.size === 0) return 0.5;
  let matches = 0;
  for (const t of j) {
    if (c.has(t)) matches++;
  }
  const overlap = matches / j.size;
  const exact = normalize(candidateTitle).includes(normalize(jobTitle)) || normalize(jobTitle).includes(normalize(candidateTitle));
  return Math.min(1, overlap * 0.7 + (exact ? 0.3 : 0));
}

/**
 * Compute 0–100 match score and top reasons.
 */
export function calculateMatchScore(
  candidate: CandidateForMatch,
  job: JobForMatch
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const cSkills = (candidate.skills ?? []).map((s) => (typeof s === 'string' ? s : '').toLowerCase()).filter(Boolean);
  const mustHave = (job.must_have_skills ?? []).map((s) => s.toLowerCase()).filter(Boolean);

  if (mustHave.length > 0) {
    const matched = mustHave.filter((m) => cSkills.some((c) => c.includes(m) || m.includes(c)));
    const ratio = matched.length / mustHave.length;
    score += ratio * WEIGHTS.skills * 100;
    if (matched.length > 0) reasons.push(`${matched.length} must-have skills match`);
    if (matched.length < mustHave.length && mustHave.length - matched.length <= 2) {
      reasons.push(`Add ${mustHave.length - matched.length} more required skills to improve match`);
    }
  } else {
    score += WEIGHTS.skills * 100;
  }

  const years = candidate.years_of_experience ?? 0;
  const required = job.min_years_experience ?? 0;
  if (required > 0) {
    if (years >= required) {
      score += WEIGHTS.experience * 100;
      reasons.push(`Meets experience (${years}+ years)`);
    } else {
      const ratio = years / required;
      score += ratio * WEIGHTS.experience * 100;
      reasons.push(`${years} years experience (role prefers ${required}+)`);
    }
  } else {
    score += WEIGHTS.experience * 100;
  }

  const jobRemote = (job.remote_type ?? '').toLowerCase();
  const locationMatch =
    jobRemote === 'remote' ||
    (candidate.open_to_remote !== false && (jobRemote === 'hybrid' || jobRemote === 'remote')) ||
    (!!candidate.location && !!job.location && normalize(candidate.location).includes(normalize(job.location)));
  if (locationMatch) {
    score += WEIGHTS.location * 100;
    if (jobRemote === 'remote') reasons.push('Remote role');
    else if (job.location) reasons.push('Location match');
  } else {
    score += WEIGHTS.location * 50;
  }

  const desiredMin = candidate.salary_min ?? 0;
  const desiredMax = candidate.salary_max ?? 0;
  const jobMin = job.salary_min ?? 0;
  const jobMax = job.salary_max ?? 0;
  if (jobMin > 0 || jobMax > 0) {
    const inRange =
      (desiredMin === 0 && desiredMax === 0) ||
      (jobMin > 0 && jobMax > 0 && desiredMin <= jobMax && (desiredMax === 0 || desiredMax >= jobMin));
    if (inRange) {
      score += WEIGHTS.salary * 100;
      reasons.push('Salary in range');
    } else {
      score += WEIGHTS.salary * 50;
    }
  } else {
    score += WEIGHTS.salary * 100;
  }

  const titleSim = titleSimilarity(candidate.primary_title, job.title);
  score += titleSim * WEIGHTS.title * 100;
  if (titleSim >= 0.7) reasons.push('Title alignment');

  const total = Math.min(100, Math.round(score));
  return { score: total, reasons: reasons.slice(0, 3) };
}
