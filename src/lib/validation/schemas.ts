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

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalTrimmedString = (max: number) =>
  z.string().trim().max(max).optional().nullable();

export const applicationPatchSchema = z
  .object({
    status: z
      .enum(['ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'])
      .optional(),
    notes: optionalTrimmedString(5000),
    candidate_notes: optionalTrimmedString(5000),
    interview_notes: optionalTrimmedString(5000),
    interview_date: z.string().datetime().optional().nullable(),
    next_action_required: optionalTrimmedString(500),
    next_action_due: z.string().datetime().optional().nullable(),
    withdrawal_reason: optionalTrimmedString(1000),
  })
  .strict();

export const pipelineMoveSchema = z
  .object({
    application_id: uuidSchema,
    to_stage_id: uuidSchema,
    notes: optionalTrimmedString(2000),
  })
  .strict();

export const teamGoalCreateSchema = z
  .object({
    assignee_id: uuidSchema.optional().nullable(),
    goal_type: z.string().trim().min(1).max(100),
    target_value: z.coerce.number().finite().min(0).max(1_000_000_000),
    current_value: z.coerce.number().finite().min(0).max(1_000_000_000).optional().default(0),
    period_start: dateOnlySchema,
    period_end: dateOnlySchema,
  })
  .strict()
  .refine((v) => v.period_end >= v.period_start, {
    message: 'period_end must be on or after period_start',
    path: ['period_end'],
  });

export const teamGoalQuerySchema = z
  .object({
    assignee_id: uuidSchema.optional(),
    status: z.enum(['in_progress', 'completed', 'canceled']).optional(),
  })
  .strict();

export const emailSendSchema = z
  .object({
    email_account_id: uuidSchema.optional(),
    to: z
      .array(emailSchema)
      .min(1)
      .max(50),
    cc: z.array(emailSchema).max(50).optional(),
    subject: z.string().trim().min(1).max(300),
    body_html: z.string().min(1).max(100_000),
    body_text: z.string().max(100_000).optional(),
    related_candidate_id: uuidSchema.optional().nullable(),
    related_application_id: uuidSchema.optional().nullable(),
    tracking_enabled: z.boolean().optional(),
  })
  .strict();

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

// Candidate profile form (client-side validation)
const optionalUrl = z.string().max(2000).optional().refine(
  (v) => !v || v.trim() === '' || /^https?:\/\/[^\s]+$/.test(v),
  { message: 'Enter a valid URL' }
);
const optionalPhone = z.string().optional().refine(
  (v) => !v || v.trim() === '' || /^\+?[0-9\s\-().]{10,25}$/.test(v ?? ''),
  { message: 'Invalid phone number' }
);

export const profileFormSchema = z
  .object({
    full_name: z.string().max(200).optional(),
    primary_title: z.string().max(200).optional(),
    target_job_titles: z.string().max(500).optional(),
    phone: optionalPhone,
    location: z.string().max(200).optional(),
    linkedin_url: optionalUrl,
    portfolio_url: optionalUrl,
    summary: z.string().max(10000).optional(),
    default_pitch: z.string().max(2000).optional(),
    salary_min: z.union([z.number(), z.string()]).optional(),
    salary_max: z.union([z.number(), z.string()]).optional(),
    availability: z.string().max(100).optional(),
    open_to_remote: z.boolean().optional(),
    skills: z.array(z.string().max(100)).optional(),
  })
  .refine(
    (data) => {
      const min = data.salary_min != null && data.salary_min !== '' ? Number(data.salary_min) : undefined;
      const max = data.salary_max != null && data.salary_max !== '' ? Number(data.salary_max) : undefined;
      if (min != null && max != null && !Number.isNaN(min) && !Number.isNaN(max) && min > max) return false;
      return true;
    },
    { message: 'Salary min cannot be greater than salary max', path: ['salary_max'] }
  );

/** Returns field-level errors for profile form. Keys are field names. */
export function validateProfileForm(data: unknown): Record<string, string> {
  const result = profileFormSchema.safeParse(data);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && issue.message) errors[key] = issue.message;
  }
  return errors;
}
