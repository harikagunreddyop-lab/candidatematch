export function getPublicAppUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  return fromEnv.replace(/\/$/, '');
}
