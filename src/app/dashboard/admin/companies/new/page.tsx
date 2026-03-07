'use client';
export default function NewCompanyPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">New Company</h1>
      <p className="text-surface-500">Full implementation coming in next sprint. Form will call POST /api/companies (name, slug, owner_email, subscription_plan).</p>
    </div>
  );
}
