'use client';

import { createClient } from '@/lib/supabase-browser';
import { Clock, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function PendingApprovalPage() {
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-6">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Clock size={28} className="text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-surface-900 font-display">Account pending approval</h1>
        <p className="text-surface-600 mt-2 text-sm">
          Your account has been created but does not have a role assigned yet. An administrator needs to approve your account and assign you as a candidate, recruiter, or admin.
        </p>
        <p className="text-surface-500 mt-3 text-xs">
          If you believe this is an error, please contact your administrator.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={handleSignOut}
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> Sign out
          </button>
          <Link href="/" className="btn-ghost text-sm inline-flex items-center justify-center">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
