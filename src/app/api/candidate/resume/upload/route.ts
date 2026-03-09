/**
 * POST /api/candidate/resume/upload
 * Multipart: file, version_name?, tags? (JSON string array), set_default? (boolean)
 * Returns: resume_id, parsed_data, ats_score, issues
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { extractResumeText, parseResumeStructured, type ResumeFileType } from '@/lib/resume-parse';
import { calculateGenericAtsScore } from '@/lib/resume-ats-score';

export const dynamic = 'force-dynamic';

const MAX_RESUMES = 5;
const MAX_FILE_MB = 10;
const ALLOWED_TYPES: { [k: string]: ResumeFileType } = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

function getFileType(mime: string): ResumeFileType | null {
  return ALLOWED_TYPES[mime] || null;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
  }

  const candidateId = candidate.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const versionName = (formData.get('version_name') as string) || undefined;
  const setDefault = formData.get('set_default') === 'true';
  let tags: string[] = [];
  try {
    const tagsRaw = formData.get('tags');
    if (typeof tagsRaw === 'string') tags = JSON.parse(tagsRaw);
    if (!Array.isArray(tags)) tags = [];
  } catch {
    tags = [];
  }

  if (!file || !file.size) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const fileType = getFileType(file.type);
  if (!fileType) {
    return NextResponse.json(
      { error: 'Only PDF, DOCX, and TXT files are allowed' },
      { status: 400 }
    );
  }

  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_MB) {
    return NextResponse.json(
      { error: `File too large. Max ${MAX_FILE_MB}MB.` },
      { status: 400 }
    );
  }

  const { count } = await supabase
    .from('candidate_resumes')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidateId);

  if ((count ?? 0) >= MAX_RESUMES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_RESUMES} resumes. Delete one first.` },
      { status: 400 }
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${candidateId}/${Date.now()}_${safeName}`;
  const arrayBuffer = await file.arrayBuffer();

  const { data: storageData, error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError || !storageData?.path) {
    return NextResponse.json(
      { error: 'Storage upload failed: ' + (uploadError?.message || 'unknown') },
      { status: 500 }
    );
  }

  const parsedText = await extractResumeText(arrayBuffer, fileType);
  const parsedData = parseResumeStructured(parsedText);
  const atsResult = calculateGenericAtsScore(parsedText, parsedData);

  if (setDefault) {
    await supabase
      .from('candidate_resumes')
      .update({ is_default: false })
      .eq('candidate_id', candidateId);
  }

  const { data: inserted, error: dbError } = await supabase
    .from('candidate_resumes')
    .insert({
      candidate_id: candidateId,
      label: versionName || file.name || 'Resume',
      pdf_path: storageData.path,
      file_name: file.name,
      file_size: file.size,
      file_type: fileType,
      parsed_text: parsedText || null,
      ats_score: atsResult.score,
      ats_feedback: atsResult as unknown as object,
      is_default: setDefault,
      version_name: versionName || null,
      tags: tags.length ? tags : [],
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (dbError) {
    await supabase.storage.from('resumes').remove([storageData.path]);
    return NextResponse.json({ error: 'Database error: ' + dbError.message }, { status: 500 });
  }

  await supabase.from('resume_ats_checks').insert({
    resume_id: inserted.id,
    job_id: null,
    ats_score: atsResult.score,
    keyword_matches: atsResult.breakdown.keywords.matched,
    keyword_misses: atsResult.breakdown.keywords.missing,
    formatting_issues: atsResult.breakdown.formatting.issues,
    recommendations: atsResult.recommendations,
  });

  await supabase
    .from('candidates')
    .update({ parsed_resume_text: parsedText || null })
    .eq('id', candidateId);

  const responseData = {
    name: parsedData.name,
    email: parsedData.email,
    phone: parsedData.phone,
    skills: parsedData.skills,
    experience: parsedData.experience,
    education: parsedData.education,
  };

  return NextResponse.json({
    resume_id: inserted.id,
    parsed_data: responseData,
    ats_score: atsResult.score,
    issues: atsResult.recommendations,
    breakdown: atsResult.breakdown,
  });
}
