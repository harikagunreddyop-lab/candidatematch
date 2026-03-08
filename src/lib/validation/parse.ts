/**
 * Helper to validate request body and return 400 with Zod error details.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

export function validationErrorResponse(error: z.ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'Validation failed',
      details: error.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    },
    { status: 400 }
  );
}

export function parseBody<T>(body: unknown, schema: z.ZodType<T>): { data: T } | { error: NextResponse } {
  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };
  return { error: validationErrorResponse(result.error) };
}
