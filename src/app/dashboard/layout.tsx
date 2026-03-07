import { requireAuth } from '@/lib/auth';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { DashboardProfile } from '@/types';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  try {
    const profile = await requireAuth();
    const serializable: DashboardProfile = {
      id: profile.id,
      name: profile.name ?? '',
      email: profile.email ?? '',
      role: profile.role,
      effective_role: profile.effective_role,
      company_id: profile.company_id ?? null,
      avatar_url: profile.avatar_url ?? undefined,
      created_at: String(profile.created_at ?? ''),
      updated_at: String(profile.updated_at ?? ''),
    };
    return <DashboardLayout profile={serializable}>{children}</DashboardLayout>;
  } catch (err: unknown) {
    // Rethrow Next.js redirect/notFound so the framework can handle them
    if (err && typeof err === 'object' && 'digest' in err) {
      const d = (err as { digest?: string }).digest;
      if (typeof d === 'string' && (d.startsWith('NEXT_REDIRECT') || d.startsWith('NEXT_NOT_FOUND')))
        throw err;
    }
    console.error('[dashboard layout]', err);
    const { redirect } = await import('next/navigation');
    redirect('/');
  }
}