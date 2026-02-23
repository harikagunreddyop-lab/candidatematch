'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, Modal } from '@/components/ui';
import { Briefcase, Plus, ExternalLink, Eye, RefreshCw, Zap, AlertCircle, Upload } from 'lucide-react';
import { formatRelative, truncate } from '@/utils/helpers';

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddJob, setShowAddJob] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [matching, setMatching] = useState(false);
  const [matchMsg, setMatchMsg] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const supabase = createClient();

  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  const sourceFilterRef = useRef(sourceFilter);
  useEffect(() => { sourceFilterRef.current = sourceFilter; setPage(0); }, [sourceFilter]);

  const load = useCallback(async (silent = false) => {
    const currentPage = pageRef.current;
    if (!silent) setLoading(true);
    setError(null);

    const [listRes, countRes] = await Promise.all([
      (() => {
        let q = supabase.from('jobs').select('*').order('scraped_at', { ascending: false });
        if (sourceFilterRef.current !== 'all') q = q.eq('source', sourceFilterRef.current);
        return q.range(currentPage * 10, (currentPage + 1) * 10 - 1);
      })(),
      (() => {
        let q = supabase.from('jobs').select('id', { count: 'exact', head: true });
        if (sourceFilterRef.current !== 'all') q = q.eq('source', sourceFilterRef.current);
        return q;
      })(),
    ]);

    if (listRes.error) {
      setError(listRes.error.message);
    } else {
      setJobs(listRes.data || []);
      setTotalCount(countRes.count || 0);
      setLastRefreshed(new Date());
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [page, load]);

  useEffect(() => {
    const interval = setInterval(() => load(true), 10000);
    return () => clearInterval(interval);
  }, [load]);

  // ── Run Matching — reads SSE stream from /api/matches ─────────────────────
  const runMatching = async () => {
    setMatching(true);
    setMatchMsg(null);

    try {
      const res = await fetch('/api/matches', { method: 'POST' });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6);
          if (!payload) continue;

          try {
            const event = JSON.parse(payload);

            // ✅ backend emits "log" (not progress)
            if (event.type === 'log' || event.type === 'progress') {
              setMatchMsg(`⏳ ${event.message}`);
            } else if (event.type === 'complete') {
              const r = event.result || {};
              setMatchMsg(
                `✅ ${r.total_matches_upserted ?? r.total_matches ?? 0} matches across ${r.candidates_processed ?? 0} candidates`
              );
            } else if (event.type === 'error') {
              throw new Error(event.message || 'Matching failed');
            }
          } catch (parseErr: any) {
            // ignore partial lines / decode artifacts
            if (!String(parseErr?.message || '').includes('Unexpected token')) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[matching] frontend error:', err);
      setMatchMsg(`❌ Matching failed: ${err.message || String(err)}`);
    }

    setMatching(false);
  };

  const filtered = jobs.filter(j =>
    j.title?.toLowerCase().includes(search.toLowerCase()) ||
    j.company?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Jobs</h1>
          <p className="text-sm text-surface-500 mt-1">
            {totalCount.toLocaleString()} active jobs · page {page + 1} ·{' '}
            {lastRefreshed && (
              <span className="text-surface-400">
                updated {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => load()} className="btn-ghost text-sm flex items-center gap-1.5">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={runMatching} disabled={matching} className="btn-secondary text-sm flex items-center gap-1.5">
            {matching ? <><Spinner size={12} /> Matching...</> : <><Zap size={14} /> Run Matching</>}
          </button>
          <button onClick={() => setShowUpload(true)} className="btn-secondary text-sm flex items-center gap-1.5">
            <Upload size={14} /> Upload CSV/Excel
          </button>
          <button onClick={() => setShowAddJob(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={16} /> Add Job
          </button>
        </div>
      </div>

      {matchMsg && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${
          matchMsg.startsWith('✅') ? 'border-green-200 dark:border-green-500/40 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200'
          : matchMsg.startsWith('⏳') ? 'border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
          : 'border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200'
        }`}>
          {matchMsg}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Failed to load jobs</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by title or company..." />
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          aria-label="Filter by source"
          title="Filter by source"
          className="input text-sm w-full sm:w-36 shrink-0"
        >
          <option value="all">All sources</option>
          <option value="linkedin">LinkedIn</option>
          <option value="indeed">Indeed</option>
          <option value="manual">Manual</option>
          <option value="import">Imported</option>
          <option value="seed">Seed</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={24} />}
          title="No jobs yet"
          description='Go to the Scraping page to pull jobs, or click "Add Job" to add manually'
        />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Location</th>
                <th>Source</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => (
                <tr key={j.id}>
                  <td className="font-medium text-surface-900 max-w-[250px] truncate">{j.title}</td>
                  <td>{j.company}</td>
                  <td className="text-surface-500">{truncate(j.location || '—', 25)}</td>
                  <td><span className="badge-neutral text-xs capitalize">{j.source}</span></td>
                  <td className="text-surface-500 text-xs">{formatRelative(j.scraped_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setViewing(j)} className="btn-ghost p-1.5" title="View JD">
                        <Eye size={14} />
                      </button>
                      {j.url && (
                        <a href={j.url} target="_blank" rel="noreferrer" className="btn-ghost p-1.5" title="Open original">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-5 py-3 border-t border-surface-200">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-ghost text-xs">← Prev</button>
            <span className="text-xs text-surface-500">
              Showing {page * 10 + 1}–{Math.min((page + 1) * 10, totalCount)} of {totalCount.toLocaleString()}
            </span>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 10 >= totalCount} className="btn-ghost text-xs">Next →</button>
          </div>
        </div>
      )}

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.title} size="lg">
          <div className="space-y-3">
            <p className="text-sm"><strong>Company:</strong> {viewing.company}</p>
            <p className="text-sm"><strong>Location:</strong> {viewing.location || 'N/A'}</p>
            {viewing.salary_min && (
              <p className="text-sm">
                <strong>Salary:</strong> ${viewing.salary_min.toLocaleString()}
                {viewing.salary_max ? ` – $${viewing.salary_max.toLocaleString()}` : '+'}
              </p>
            )}
            {viewing.job_type && <p className="text-sm"><strong>Type:</strong> {viewing.job_type}</p>}
            {viewing.remote_type && <p className="text-sm"><strong>Remote:</strong> {viewing.remote_type}</p>}
            {viewing.url && (
              <a href={viewing.url} target="_blank" rel="noreferrer"
                className="text-sm text-brand-600 hover:underline flex items-center gap-1">
                <ExternalLink size={12} /> View original posting
              </a>
            )}
            <div className="mt-4 p-4 bg-surface-50 dark:bg-surface-800 rounded-xl max-h-[400px] overflow-y-auto">
              <p className="text-sm text-surface-700 whitespace-pre-wrap">
                {viewing.jd_clean || 'No description available'}
              </p>
            </div>
          </div>
        </Modal>
      )}

      {showAddJob && (
        <Modal open onClose={() => setShowAddJob(false)} title="Add Job Manually" size="lg">
          <AddJobForm onClose={() => setShowAddJob(false)} onSaved={() => load()} />
        </Modal>
      )}

      {showUpload && (
        <Modal open onClose={() => setShowUpload(false)} title="Upload Jobs (CSV / Excel)" size="xl">
          <UploadJobsForm onClose={() => setShowUpload(false)} onSaved={() => load()} />
        </Modal>
      )}
    </div>
  );
}

// ─── Add Job Form ─────────────────────────────────────────────────────────────
function AddJobForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ title: '', company: '', location: '', url: '', jd_clean: '' });
  const upd = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('jobs').insert({
      ...f,
      source: 'manual',
      jd_raw: f.jd_clean,
      dedupe_hash: btoa(encodeURIComponent(f.title + f.company + f.location)).slice(0, 32),
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="space-y-4">
      {([['title', 'Title *'], ['company', 'Company *'], ['location', 'Location'], ['url', 'Job URL']] as const).map(([k, l]) => (
        <div key={k}>
          <label className="label">{l}</label>
          <input className="input text-sm" value={(f as any)[k]} onChange={e => upd(k, e.target.value)} />
        </div>
      ))}
      <div>
        <label className="label">Job Description</label>
        <textarea className="input text-sm h-40 resize-none" value={f.jd_clean} onChange={e => upd('jd_clean', e.target.value)} />
      </div>
      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
      <div className="flex justify-end gap-3 pt-4 border-t border-surface-200">
        <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        <button onClick={save} disabled={saving || !f.title || !f.company} className="btn-primary text-sm">
          {saving ? 'Saving...' : 'Add Job'}
        </button>
      </div>
    </div>
  );
}

// ─── Upload Jobs Form ─────────────────────────────────────────────────────────
function UploadJobsForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [stage, setStage] = useState<'pick' | 'preview' | 'uploading' | 'matching' | 'done'>('pick');
  const [rows, setRows] = useState<any[]>([]);
  const [parsed, setParsed] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const mapRow = (row: any) => {
    // Normalize keys once so we can match case-insensitively
    const norm: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      norm[k.toLowerCase()] = v;
    }

    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = norm[k.toLowerCase()];
        if (v !== undefined && v !== null && String(v).trim() !== '' && v !== 'None') return String(v).trim();
      }
      return '';
    };

    // ✅ supports Apify LinkedIn exports + common CSV headers (case-insensitive)
    return {
      title: pick('job_title', 'title', 'Title', 'jobtitle', 'position', 'Job Title'),
      company: pick(
        'company_name',
        'company/name',
        'company',
        'companyName',
        'employer',
        'organization', // Apify: organization
        'organisation'
      ),
      location: pick('location', 'location/linkedinText', 'location/parsed/text', 'Location', 'city', 'City'),
      url: pick(
        'job_url', 'apply_url',
        'linkedinUrl', 'applyMethod/companyApplyUrl', 'easyApplyUrl',
        'url', 'URL', 'link', 'Job URL'
      ),
      jd: pick(
        'description_text', 'description_html',
        'descriptionText', 'descriptionHtml',
        'description', 'job_description', 'jd', 'Description'
      ),
      salary: pick('salary_range', 'salary/text', 'salaryText', 'salary', 'Salary'),
    };
  };

  const parseFile = async (file: File) => {
    setError(null);
    setFileName(file.name);

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rawRows.length) { setError('File appears empty.'); return; }

      const mappedRows = rawRows.map(mapRow).filter(r => r.title && r.company);

      if (!mappedRows.length) {
        setError(
          `Could not find title/company columns.\nColumns found: ${Object.keys(rawRows[0]).slice(0, 12).join(', ')}...\n` +
          `Expected columns: job_title + company_name (Apify) OR title + company (simple CSV).`
        );
        return;
      }

      setRows(rawRows);
      setParsed(mappedRows);
      setStage('preview');
    } catch (e: any) {
      setError(`Failed to parse file: ${e.message}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const upload = async () => {
    setStage('uploading');

    try {
      // ✅ MUST upload parsed (mapped) rows, not raw rows
      const res = await fetch('/api/upload-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: parsed }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setResult(data);
      onSaved();

      if (data.inserted > 0 && data.matching?.status === 'started') {
        setStage('done');
      } else {
        if (data.inserted > 0) setStage('matching');
        await new Promise(r => setTimeout(r, 400));
        setStage('done');
      }
    } catch (e: any) {
      setError(e.message);
      setStage('preview');
    }
  };

  if (stage === 'pick') return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl p-10 text-center cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
      >
        <Upload size={28} className="mx-auto text-surface-400 mb-3" />
        <p className="text-sm font-medium text-surface-700">Drop your file here or click to browse</p>
        <p className="text-xs text-surface-400 mt-1">Supports .csv, .xlsx, .xls — including LinkedIn Apify exports</p>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])} className="hidden" />
      </div>

      {error && <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-xs text-red-700 dark:text-red-200 whitespace-pre-wrap"><AlertCircle size={12} className="inline mr-1" />{error}</div>}

      <div className="flex justify-end pt-2 border-t border-surface-200">
        <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
      </div>
    </div>
  );

  if (stage === 'preview') return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-surface-800">📄 {fileName}</p>
          <p className="text-xs text-surface-500 mt-0.5">{parsed.length} valid jobs ready to import</p>
        </div>
        <button onClick={() => { setRows([]); setParsed([]); setStage('pick'); }} className="btn-ghost text-xs">← Change file</button>
      </div>

      <div className="rounded-xl border border-surface-200 overflow-hidden">
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-600">
              <tr>
                {['#', 'Title', 'Company', 'Location', 'Has JD'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-surface-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {parsed.slice(0, 50).map((r, i) => (
                <tr key={i} className="hover:bg-surface-50">
                  <td className="px-3 py-1.5 text-surface-400">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-surface-800 max-w-[180px] truncate">{r.title}</td>
                  <td className="px-3 py-1.5 text-surface-600 max-w-[140px] truncate">{r.company}</td>
                  <td className="px-3 py-1.5 text-surface-500 max-w-[120px] truncate">{r.location || '—'}</td>
                  <td className="px-3 py-1.5">{r.jd ? <span className="text-green-600 font-medium">✓</span> : <span className="text-surface-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-xs text-red-700 dark:text-red-200"><AlertCircle size={12} className="inline mr-1" />{error}</div>}

      <div className="flex justify-between pt-2 border-t border-surface-200">
        <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        <button onClick={upload} className="btn-primary text-sm flex items-center gap-1.5">
          <Upload size={14} /> Import {parsed.length} Jobs
        </button>
      </div>
    </div>
  );

  if (stage === 'uploading') return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <Spinner size={28} />
      <p className="text-sm font-semibold text-surface-700">Importing jobs...</p>
      <p className="text-xs text-surface-400">Deduplicating and saving to database</p>
    </div>
  );

  if (stage === 'matching') return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <Spinner size={28} />
      <p className="text-sm font-semibold text-surface-700">Running matching engine...</p>
      <p className="text-xs text-surface-400">Scoring new jobs against all active candidates with AI</p>
    </div>
  );

  const matchingResult = result?.matching;
  const matchingOk = matchingResult?.status === 'completed';
  const matchingStarted = matchingResult?.status === 'started';

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-2xl">✅</div>
        <p className="text-lg font-semibold text-surface-900 dark:text-surface-100">Import Complete</p>

        <div className="flex gap-6 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-brand-600">{result?.inserted}</p>
            <p className="text-xs text-surface-500 mt-0.5">Jobs added</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-surface-400">{result?.duplicates}</p>
            <p className="text-xs text-surface-500 mt-0.5">Duplicates skipped</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-surface-400">{result?.skipped}</p>
            <p className="text-xs text-surface-500 mt-0.5">Invalid rows</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-surface-700 dark:text-surface-300">{result?.total}</p>
            <p className="text-xs text-surface-500 mt-0.5">Total rows</p>
          </div>
        </div>

        {matchingResult && (
          <div className={`w-full rounded-xl border px-5 py-4 text-sm mt-2 ${
            matchingOk
              ? 'border-brand-200 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/10'
              : matchingStarted
              ? 'border-brand-200 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/10'
              : matchingResult.status === 'skipped'
              ? 'border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800'
              : 'border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/20'
          }`}>
            {matchingOk ? (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="text-left">
                  <p className="font-semibold text-brand-700 dark:text-brand-300">🤖 Auto-matching ran</p>
                  <p className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">
                    {matchingResult.candidates_processed} candidate{matchingResult.candidates_processed !== 1 ? 's' : ''} scored ·{' '}
                    {matchingResult.total_matches_upserted} matches saved
                  </p>
                </div>
              </div>
            ) : matchingStarted ? (
              <div className="text-left">
                <p className="font-semibold text-brand-700 dark:text-brand-300">🤖 Matching running in background</p>
                <p className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">
                  {matchingResult.message ?? 'Matches will appear in candidate dashboards in a few minutes.'}
                </p>
              </div>
            ) : matchingResult.status === 'skipped' ? (
              <p className="text-surface-500 dark:text-surface-400 text-xs">No new jobs were inserted — matching skipped</p>
            ) : (
              <p className="text-red-600 dark:text-red-400 text-xs">⚠️ Matching failed: {matchingResult.error}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center pt-2 border-t border-surface-200">
        <button onClick={onClose} className="btn-primary text-sm">Done</button>
      </div>
    </div>
  );
}