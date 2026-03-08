/**
 * Zod schemas for API input validation.
 * Use in route handlers: schema.parse(body) or schema.safeParse(body).
 */
import { z } from 'zod';

export const emailSchema = z.string().email().max(255);
export const passwordSchema = z.string().min(8).max(100);
export const nameSchema = z.string().min(1).max(200);
export const phoneSchema = z.string().regex(/^\+?[0-9\s\-()]{10,20}$/).optional().or(z.literal(''));

export const uuidSchema = z.string().uuid();

// Candidate
export const candidateCreateSchema = z.object({
  full_name: nameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema,
  location: z.string().max(200).optional(),
  primary_title: z.string().max(200).optional(),
  years_of_experience: z.number().min(0).max(70).optional(),
  skills: z.array(z.string().max(100)).max(100).optional(),
});
export const candidateUpdateSchema = candidateCreateSchema.partial();

// Job
export const jobCreateSchema = z.object({
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  url: z.string().url().optional().or(z.literal('')),
  jd_raw: z.string().optional(),
  company_id: uuidSchema.optional(),
  posted_by: uuidSchema.optional(),
});
export const jobUpdateSchema = jobCreateSchema.partial();

// Application
export const applicationCreateSchema = z.object({
  candidate_id: uuidSchema,
  job_id: uuidSchema,
  resume_version_id: uuidSchema.optional(),
  notes: z.string().max(5000).optional(),
  override_gate: z.boolean().optional(),
  override_reason: z.string().max(500).optional(),
});
export const applicationUpdateSchema = z.object({
  status: z.enum([
    'ready',
    'applied',
    'screening',
    'interview',
    'offer',
    'rejected',
    'withdrawn',
  ]),
  notes: z.string().max(5000).optional(),
  interview_date: z.string().datetime().optional(),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Message
export const messageCreateSchema = z.object({
  conversation_id: uuidSchema,
  content: z.string().min(1).max(10000),
});

// Invite
export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(['candidate', 'recruiter', 'admin', 'company_admin']),
  name: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
});

// Auth / callback
export const authCallbackSearchParamsSchema = z.object({
  code: z.string().optional(),
  next: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});
