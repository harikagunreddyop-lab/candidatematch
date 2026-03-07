import { requireCompanyStaff } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  await requireCompanyStaff();
  return <>{children}</>;
}
