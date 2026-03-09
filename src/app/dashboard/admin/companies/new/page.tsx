'use client';
export default function NewCompanyPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="admin-page-title">New Company</h1>
        <p className="admin-page-subtitle">Create a company workspace and owner account.</p>
      </div>
      <div className="card p-6">
        <p className="text-sm text-surface-600">
          Full implementation coming in next sprint. Form will call `POST /api/companies` with
          `name`, `slug`, `owner_email`, and `subscription_plan`.
        </p>
      </div>
    </div>
  );
}
