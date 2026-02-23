import Link from 'next/link';
import Image from 'next/image';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white dark:bg-surface-800 flex items-center justify-center shadow-lg shadow-brand-500/25 border border-surface-200 dark:border-surface-600">
          <Image src="/logo.png" alt="Logo" width={48} height={48} className="object-contain" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display tracking-tight">Orion CMOS</h1>
        </div>
      </div>
      <div className="card p-8 max-w-md w-full text-center dark:bg-surface-800 dark:border-surface-600">
        <p className="text-6xl font-bold text-surface-200 dark:text-surface-500 mb-2">404</p>
        <h2 className="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">Page not found</h2>
        <p className="text-sm text-surface-500 dark:text-surface-300 mb-6">
          The page you’re looking for doesn’t exist or may have been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 btn-primary"
        >
          <Home size={16} /> Go to home
        </Link>
      </div>
    </div>
  );
}
