/**
 * GET /api/ready — Readiness for load balancers.
 * Returns 200 when the app is ready to accept traffic.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ready: true });
}
