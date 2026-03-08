'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Spinner } from '@/components/ui';

export default function CompanyJobNewPage() {
  const supabase = createClient();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in'); return; }
    const { data: profile } = await supabase.from('profile_roles').select('company_id').eq('id', session.user.id).single();
    if (!profile?.company_id) { setError('No company linked'); return; }

    setSaving(true);
    const { data: company } = await supabase.from('companies').select('name').eq('id', profile.company_id).single();
    const dedupeHash = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { data: job, error: insertError } = await supabase.from('jobs').insert({
      title: title || 'Untitled Job',
      company: companyName || company?.name || 'Company',
      location: location || null,
      jd_raw: description || null,
      jd_clean: description || null,
      company_id: profile.company_id,
      posted_by: session.user.id,
      created_by: session.user.id,
      source: 'manual',
      dedupe_hash: dedupeHash,
      is_active: true,
    }).select('id').single();

    setSaving(false);
    if (insertError) { setError(insertError.message); return; }
    router.push(`/dashboard/company/jobs/${job?.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href="/dashboard/company/jobs" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
        <ChevronLeft size={18} /> Jobs
      </Link>
      <h1 className="text-2xl font-bold text-white">Post a job</h1>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-surface-700 bg-surface-800/50 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Job title *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500" placeholder="e.g. Senior Engineer" />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Company name</label>
          <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500" placeholder="Your company" />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Location</label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500" placeholder="Remote / City" />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} className="w-full px-4 py-2 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder-surface-500" placeholder="Job description and requirements..." />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-[#0a0f00] rounded-xl font-semibold">
          {saving ? <Spinner size={18} className="inline mr-2" /> : null} Post job
        </button>
      </form>
    </div>
  );
}
