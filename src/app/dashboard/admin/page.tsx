import AdminDashboardClient from './AdminDashboardClient';
import { createServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type AppRow = { candidate_id: string | null; status: string | null; created_at: string };

function buildActivityChart(rows: AppRow[]) {
  const labels = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    return d.toISOString().slice(0, 10);
  });

  const byDate = new Map<string, number>();
  for (const row of rows) {
    const key = row.created_at?.slice(0, 10);
    if (!key) continue;
    byDate.set(key, (byDate.get(key) || 0) + 1);
  }

  return labels.map((date) => ({
    date: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }),
    count: byDate.get(date) || 0,
  }));
}

export default async function AdminDashboardPage() {
  const supabase = createServerSupabase();
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [
    candidatesCountRes,
    jobsCountRes,
    resumesCountRes,
    appsCountRes,
    matchesCountRes,
    recruitersCountRes,
    recruitersRes,
    candidatesRes,
    appsRes,
    recentAppsRes,
    topMatchesRes,
    activityRes,
  ] = await Promise.all([
    supabase.from('candidates').select('id', { count: 'exact', head: true }),
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
    supabase.from('resumes').select('id', { count: 'exact', head: true }),
    supabase.from('applications').select('id', { count: 'exact', head: true }),
    supabase.from('matches').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'recruiter'),
    supabase.from('profiles').select('id,name,email,created_at').eq('role', 'recruiter').order('created_at', { ascending: false }).limit(50),
    supabase.from('candidates').select('id,full_name,primary_title,location,active,skills,created_at,assigned_recruiter_id').order('created_at', { ascending: false }).limit(80),
    supabase.from('applications').select('candidate_id,status,created_at').order('created_at', { ascending: false }).limit(5000),
    supabase.from('applications').select('created_at,status,candidate:candidates(full_name),job:jobs(title,company)').order('created_at', { ascending: false }).limit(10),
    supabase.from('matches').select('fit_score,candidate:candidates(full_name),job:jobs(title,company)').order('fit_score', { ascending: false }).limit(10),
    supabase.from('applications').select('candidate_id,status,created_at').gte('created_at', since.toISOString()).order('created_at', { ascending: true }),
  ]);

  const candidates = candidatesRes.data || [];
  const recruiters = recruitersRes.data || [];
  const applications = (appsRes.data || []) as AppRow[];

  const appsByCandidate = new Map<string, number>();
  const latestByCandidate = new Map<string, { created_at: string; status: string | null }>();
  for (const app of applications) {
    if (!app.candidate_id) continue;
    appsByCandidate.set(app.candidate_id, (appsByCandidate.get(app.candidate_id) || 0) + 1);
    const latest = latestByCandidate.get(app.candidate_id);
    if (!latest || app.created_at > latest.created_at) {
      latestByCandidate.set(app.candidate_id, { created_at: app.created_at, status: app.status });
    }
  }

  const stats = {
    candidates: candidatesCountRes.count || 0,
    jobs: jobsCountRes.count || 0,
    resumes: resumesCountRes.count || 0,
    applications: appsCountRes.count || 0,
    matches: matchesCountRes.count || 0,
    recruiters: recruitersCountRes.count || 0,
  };

  const pipeline = {
    ready: applications.filter((a) => a.status === 'ready').length,
    applied: applications.filter((a) => a.status === 'applied').length,
    screening: applications.filter((a) => a.status === 'screening').length,
    interview: applications.filter((a) => a.status === 'interview').length,
    offer: applications.filter((a) => a.status === 'offer').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  const candidateRows = candidates.map((c: any) => ({
    id: c.id,
    full_name: c.full_name || 'Unknown',
    primary_title: c.primary_title || 'Unknown',
    location: c.location || '',
    active: Boolean(c.active),
    skills: Array.isArray(c.skills) ? c.skills : [],
    created_at: c.created_at,
    applications_count: appsByCandidate.get(c.id) || 0,
    latest_status: latestByCandidate.get(c.id)?.status || null,
  }));

  const candidatesByRecruiter = new Map<string, string[]>();
  for (const c of candidates) {
    const recruiterId = c.assigned_recruiter_id;
    if (!recruiterId) continue;
    const arr = candidatesByRecruiter.get(recruiterId) || [];
    arr.push(c.id);
    candidatesByRecruiter.set(recruiterId, arr);
  }

  const recruiterRows = recruiters.map((r: any) => {
    const candidateIds = candidatesByRecruiter.get(r.id) || [];
    let applicationsCount = 0;
    let interviewsCount = 0;
    let offersCount = 0;
    for (const candidateId of candidateIds) {
      for (const app of applications) {
        if (app.candidate_id !== candidateId) continue;
        applicationsCount += 1;
        if (app.status === 'interview') interviewsCount += 1;
        if (app.status === 'offer') offersCount += 1;
      }
    }

    return {
      id: r.id,
      name: r.name || '',
      email: r.email || '',
      created_at: r.created_at,
      candidates_count: candidateIds.length,
      applications_count: applicationsCount,
      interviews_count: interviewsCount,
      offers_count: offersCount,
    };
  });

  return (
    <AdminDashboardClient
      stats={stats}
      pipeline={pipeline}
      candidates={candidateRows}
      recruiters={recruiterRows}
      recentApps={recentAppsRes.data || []}
      topMatches={topMatchesRes.data || []}
      activityChart={buildActivityChart((activityRes.data || []) as AppRow[])}
    />
  );
}
