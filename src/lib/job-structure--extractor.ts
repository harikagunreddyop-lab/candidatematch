// ============================================================================
// src/lib/job-structure-extractor.ts
// Extract Structured Requirements from Job Descriptions (ONCE)
// ============================================================================

import { createHash } from 'crypto';
import type { Job } from '@/types';
import type { StructuredJob } from './ats-scorer';
import { createServiceClient } from '@/lib/supabase-server';
import { log as devLog, error as logError } from '@/lib/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

// ── Main Extractor ───────────────────────────────────────────────────────────

export async function extractJobStructure(job: Job): Promise<StructuredJob> {
  const supabase = createServiceClient();

  const jd = job.jd_clean || job.jd_raw || '';
  if (!jd || jd.length < 50) {
    throw new Error('Job description too short to analyze');
  }

  // Generate hash to detect changes
  const hash = createHash('sha256').update(jd).digest('hex').slice(0, 16);

  // Check if already structured with same content
  const { data: existing } = await supabase
    .from('jobs')
    .select('structured_requirements, structure_hash')
    .eq('id', job.id)
    .single();

  if (existing?.structure_hash === hash && existing?.structured_requirements) {
    devLog(`[Job ${job.id}] Using cached structure`);
    return existing.structured_requirements as StructuredJob;
  }

  devLog(`[Job ${job.id}] Extracting structure for: ${job.title}`);

  // Extract via Anthropic
  const prompt = buildExtractionPrompt(job);
  const extracted = await callAnthropicForExtraction(prompt);
  
  // Build structured object
  const structured: StructuredJob = {
    normalizedTitle: extracted.normalizedTitle || job.title,
    relatedTitles: extracted.relatedTitles || [],
    seniorityLevel: extracted.seniorityLevel || 'mid',
    mustHaveSkills: extracted.mustHaveSkills || [],
    niceToHaveSkills: extracted.niceToHaveSkills || [],
    responsibilities: extracted.responsibilities || [],
    minYearsExperience: extracted.minYearsExperience || null,
    isRemote: extracted.isRemote !== undefined ? extracted.isRemote : isRemoteJob(job),
    location: job.location || null, // FIX: Added location property
    visaRequirement: extracted.visaRequirement || null,
    weightedKeywords: buildWeightedKeywords(extracted),
    embedding: null, // Can add OpenAI embeddings later
  };

  // Save to database
  await supabase
    .from('jobs')
    .update({
      structured_requirements: structured,
      must_have_skills: structured.mustHaveSkills,
      nice_to_have_skills: structured.niceToHaveSkills,
      seniority_level: structured.seniorityLevel,
      min_years_experience: structured.minYearsExperience,
      weighted_keywords: structured.weightedKeywords,
      remote_requirement: structured.isRemote ? 'remote' : 'onsite',
      structure_hash: hash,
      structured_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  devLog(`[Job ${job.id}] ✓ Structured with ${structured.mustHaveSkills.length} must-have skills`);

  return structured;
}

// ── Prompt Builder ───────────────────────────────────────────────────────────

function buildExtractionPrompt(job: Job): string {
  const jd = job.jd_clean || job.jd_raw || '';

  return `Extract structured requirements from this job description.

**RETURN ONLY VALID JSON** matching this exact schema:
{
  "normalizedTitle": "Software Engineer",
  "relatedTitles": ["Developer", "Programmer", "SWE"],
  "seniorityLevel": "mid",
  "mustHaveSkills": ["Python", "SQL", "AWS"],
  "niceToHaveSkills": ["Docker", "Kubernetes"],
  "responsibilities": ["Build REST APIs", "Deploy microservices"],
  "minYearsExperience": 3,
  "isRemote": true,
  "visaRequirement": "US Citizen or Green Card"
}

**RULES:**
1. normalizedTitle: Standardize the job title (e.g., "Sr. Software Eng" → "Software Engineer")
2. relatedTitles: Other titles that would qualify (max 5)
3. seniorityLevel: Must be one of: junior, mid, senior, lead, principal, c_level
4. mustHaveSkills: ONLY skills explicitly marked as "required", "must have", or heavily emphasized (max 10)
5. niceToHaveSkills: Skills marked as "nice to have", "preferred", or "bonus" (max 10)
6. responsibilities: Core duties in 3-5 bullets
7. minYearsExperience: Extract number if mentioned, else null
8. isRemote: true if remote/hybrid mentioned, false otherwise
9. visaRequirement: Extract if mentioned, else null

**JOB DETAILS:**
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}

**JOB DESCRIPTION:**
${jd.slice(0, 4000)}

Return ONLY the JSON object, no markdown, no explanation.`;
}

// ── Anthropic API Call ───────────────────────────────────────────────────────

async function callAnthropicForExtraction(prompt: string): Promise<any> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0, // Deterministic extraction
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to extract JSON from response: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    throw new Error(`Invalid JSON in response: ${jsonMatch[0].slice(0, 200)}`);
  }
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function isRemoteJob(job: Job): boolean {
  const indicators = [
    job.remote_type?.toLowerCase().includes('remote'),
    job.location?.toLowerCase().includes('remote'),
    job.title?.toLowerCase().includes('remote'),
    job.jd_clean?.toLowerCase().includes('fully remote'),
    job.jd_raw?.toLowerCase().includes('work from home'),
  ];

  return indicators.some(Boolean);
}

function buildWeightedKeywords(extracted: any): Record<string, number> {
  const keywords: Record<string, number> = {};

  // Must-have skills get weight 3
  for (const skill of extracted.mustHaveSkills || []) {
    keywords[skill.toLowerCase()] = 3;
  }

  // Nice-to-have skills get weight 1
  for (const skill of extracted.niceToHaveSkills || []) {
    keywords[skill.toLowerCase()] = 1;
  }

  return keywords;
}

// ── Batch Processing ─────────────────────────────────────────────────────────

export async function batchExtractJobStructures(
  jobIds?: string[],
  onProgress?: (current: number, total: number, job: Job) => void
): Promise<{ processed: number; failed: number; errors: string[] }> {

  const supabase = createServiceClient();

  let query = supabase
    .from('jobs')
    .select('*')
    .eq('is_active', true)
    .is('structured_requirements', null)
    .order('created_at', { ascending: false });

  if (jobIds && jobIds.length > 0) {
    query = query.in('id', jobIds);
  }

  const { data: jobs, error } = await query;

  if (error || !jobs) {
    throw new Error(`Failed to fetch jobs: ${error?.message}`);
  }
  
  devLog(`Starting batch extraction for ${jobs.length} jobs`);

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    try {
      onProgress?.(i + 1, jobs.length, job);
      await extractJobStructure(job);
      processed++;

      // Rate limit: 5 requests per second max
      await new Promise(r => setTimeout(r, 200));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(`Failed to extract job ${job.id}:`, msg);
      errors.push(`${job.title} (${job.company}): ${msg}`);
      failed++;
    }
  }

  devLog(`Batch complete: ${processed} processed, ${failed} failed`);

  return { processed, failed, errors };
}