'use client';
// src/components/OfferCaptureModal.tsx
// Drop this into your recruiter candidate detail page.
// Usage: when user changes app status to "offer", show this modal.
// <OfferCaptureModal appId={appId} onClose={() => setShowOfferModal(false)} onSaved={load} />

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { DollarSign, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface Props {
  appId: string;
  candidateName: string;
  jobTitle: string;
  company: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function OfferCaptureModal({ appId, candidateName, jobTitle, company, onClose, onSaved }: Props) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    salary: '',
    bonus: '',
    equity: '',
    start_date: '',
    accepted: '' as '' | 'true' | 'false' | 'pending',
    notes: '',
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const offer_details = {
      salary: form.salary ? parseInt(form.salary) : null,
      bonus: form.bonus ? parseInt(form.bonus) : null,
      equity: form.equity || null,
      start_date: form.start_date || null,
      accepted: form.accepted === 'true' ? true : form.accepted === 'false' ? false : null,
      notes: form.notes || null,
    };

    const { error: err } = await supabase
      .from('applications')
      .update({ status: 'offer', offer_details })
      .eq('id', appId);

    if (err) { setError(err.message); setSaving(false); return; }
    onSaved();
    onClose();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 border border-surface-700">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
              <DollarSign size={18} className="text-green-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-surface-900">🎉 Offer Received!</h3>
              <p className="text-xs text-surface-500 mt-0.5">
                {candidateName} · {jobTitle} at {company}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 shrink-0"><X size={15} /></button>
        </div>

        <p className="text-xs text-surface-500">
          Capture the offer details for admin reporting. All fields optional.
        </p>

        {/* Form */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Base Salary (USD/yr)</label>
              <input
                type="number"
                value={form.salary}
                onChange={e => set('salary', e.target.value)}
                className="input text-sm"
                placeholder="120000"
              />
            </div>
            <div>
              <label className="label text-xs">Signing Bonus (USD)</label>
              <input
                type="number"
                value={form.bonus}
                onChange={e => set('bonus', e.target.value)}
                className="input text-sm"
                placeholder="10000"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Equity / RSU</label>
              <input
                value={form.equity}
                onChange={e => set('equity', e.target.value)}
                className="input text-sm"
                placeholder="0.1%, $50k RSU..."
              />
            </div>
            <div>
              <label className="label text-xs">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                className="input text-sm"
              />
            </div>
          </div>
          <div>
            <label className="label text-xs">Candidate Decision</label>
            <div className="flex flex-wrap gap-2">
              {[
                { val: 'pending', label: 'Pending', color: 'border-surface-600 text-surface-300' },
                { val: 'true',    label: '✓ Accepted', color: 'border-green-500/40 text-green-400 bg-green-500/10' },
                { val: 'false',   label: '✗ Declined', color: 'border-red-500/40 text-red-400 bg-red-500/10' },
              ].map(o => (
                <button
                  key={o.val}
                  type="button"
                  onClick={() => set('accepted', o.val as any)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                    form.accepted === o.val ? o.color + ' ring-2 ring-offset-1 ring-offset-surface-800 ring-brand-400' : 'border-surface-600 text-surface-400 hover:bg-surface-700'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label text-xs">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="input text-sm h-16 resize-none"
              placeholder="Negotiation notes, counter-offer details, benefits included..."
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-1">
          <button onClick={onClose} className="btn-ghost text-sm">Skip</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm min-w-[120px] flex items-center gap-2">
            {saving ? <Spinner size={14} /> : <CheckCircle2 size={14} />}
            Save Offer Details
          </button>
        </div>
      </div>
    </div>
  );
}