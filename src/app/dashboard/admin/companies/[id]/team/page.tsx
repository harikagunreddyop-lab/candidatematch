'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function AdminCompanyTeamPage() {
  const params = useParams();
  const companyId = params?.id as string;
  const supabase = createClient();
  const [company, setCompany] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const [companyRes, teamRes] = await Promise.all([
        supabase.from('companies').select('name').eq('id', companyId).single(),
        supabase.from('profiles').select('id, name, email, effective_role').eq('company_id', companyId),
      ]);
      setCompany(companyRes.data);
      setTeam(teamRes.data || []);
      setLoading(false);
    })();
  }, [companyId, supabase]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" /></div>;
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href={`/dashboard/admin/companies/${companyId}`} className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
        <ChevronLeft size={18} /> Back to company
      </Link>
      <h1 className="text-2xl font-bold text-white">{company?.name} — Team</h1>
      <div className="rounded-2xl border border-surface-700 bg-surface-800/50 overflow-hidden">
        {team.length === 0 ? <div className="p-8 text-center text-surface-500">No team members.</div> : (
          <ul className="divide-y divide-surface-700/50">
            {team.map((m: any) => (
              <li key={m.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-400/20 flex items-center justify-center text-brand-400 font-semibold text-sm">{(m.name || m.email || '?')[0].toUpperCase()}</div>
                  <div>
                    <div className="font-medium text-white">{m.name || m.email}</div>
                    <div className="text-xs text-surface-500">{m.email} · {m.effective_role?.replace('_', ' ')}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
