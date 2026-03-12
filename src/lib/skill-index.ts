import { createServiceClient } from '@/lib/supabase-server';
import { canonicalizeSkill } from '@/lib/skill-canon';

type CandidateSkillSource = 'bullet' | 'project' | 'list' | 'inferred';

export async function upsertJobSkillIndex(
  jobId: string,
  // TODO: ATS scoring replaced — rewire to new engine types at src/lib/ats/
  reqs: {
    must_have_skills?: string[];
    nice_to_have_skills?: string[];
    implicit_skills?: string[];
  },
) {
  const supabase = createServiceClient();

  const rows: Array<{ job_id: string; skill: string; is_must: boolean; weight: number }> = [];

  const pushSkills = (skills: string[] | undefined, isMust: boolean, weight: number) => {
    for (const raw of skills || []) {
      const canon = canonicalizeSkill(raw);
      if (!canon) continue;
      rows.push({ job_id: jobId, skill: canon, is_must: isMust, weight });
    }
  };

  pushSkills(reqs.must_have_skills, true, 2.0);
  pushSkills(reqs.nice_to_have_skills, false, 1.0);
  pushSkills(reqs.implicit_skills, false, 0.6);

  if (!rows.length) return;

  // Clear existing index for this job then insert fresh snapshot.
  await supabase.from('job_skill_index').delete().eq('job_id', jobId);
  await supabase.from('job_skill_index').upsert(rows);
}

export async function upsertCandidateSkillIndex(
  candidateId: string,
  skills: Array<{ name: string; weight?: number; evidence_e?: number; source?: CandidateSkillSource }>
) {
  const supabase = createServiceClient();

  const rows: Array<{
    candidate_id: string;
    skill: string;
    weight: number;
    evidence_e: number | null;
    source: CandidateSkillSource | null;
  }> = [];

  for (const s of skills) {
    const canon = canonicalizeSkill(s.name);
    if (!canon) continue;
    const baseWeight =
      s.source === 'bullet' || s.source === 'project'
        ? 1.0
        : s.source === 'list'
        ? 0.5
        : s.weight ?? 0.7;
    rows.push({
      candidate_id: candidateId,
      skill: canon,
      weight: baseWeight,
      evidence_e: s.evidence_e ?? null,
      source: s.source ?? null,
    });
  }

  if (!rows.length) return;

  await supabase.from('candidate_skill_index').delete().eq('candidate_id', candidateId);
  await supabase.from('candidate_skill_index').upsert(rows);
}

