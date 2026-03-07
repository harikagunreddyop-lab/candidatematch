import { requireCompanyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  await requireCompanyAdmin();
  return <>{children}</>;
}
