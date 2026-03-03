const path = require('path');
// Load .env from project root (parent of worker/)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fastify = require('fastify')({ logger: true });
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { buildAtsDocx } = require('./ats-docx-builder');

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.WORKER_PORT || 3001;
const TEMP_DIR = path.join(__dirname, 'tmp');
const USE_LATEX = process.env.USE_LATEX === 'true' || process.env.USE_LATEX === '1';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (project root)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Ensure temp directory
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─── Health Check ────────────────────────────────────────────────────────────
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Generate Resume Endpoint ────────────────────────────────────────────────
// Output: Word (.docx) with Elite spec. file_path should end in .docx
fastify.post('/generate', async (request, reply) => {
  const { resume_version_id, candidate, job, pdf_path, file_path } = request.body || {};
  const storagePath = file_path || pdf_path;

  if (!resume_version_id || !candidate || !job || !storagePath) {
    return reply.code(400).send({
      error: 'Missing required fields: resume_version_id, candidate, job, pdf_path or file_path',
    });
  }

  if (!ANTHROPIC_KEY) {
    fastify.log.warn('ANTHROPIC_API_KEY not set; resume generation will fail at bullet step');
  }

  try {
    // Step 1: Generate STAR bullets + summary via Claude
    await updateStatus(resume_version_id, 'generating');
    const { summary: generatedSummary, experience: experienceBullets } = await generateBullets(candidate, job);

    // Step 2: Build Word (DOCX) — ATS-optimized Elite spec
    await updateStatus(resume_version_id, 'compiling');
    const { buffer: docxBuffer, plainText } = await buildAtsDocx(candidate, experienceBullets, job, generatedSummary);

    const sizeKB = docxBuffer.length / 1024;
    if (sizeKB < 1) throw new Error('DOCX too small, likely empty');

    // Step 3: Upload to Supabase Storage (Word format)
    await updateStatus(resume_version_id, 'uploading');
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(storagePath, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Step 4: Update DB (pdf_path column stores path to .docx; resume_text for ATS scoring)
    await supabase.from('resume_versions').update({
      generation_status: 'completed',
      bullets: experienceBullets,
      pdf_path: storagePath,
      ...(plainText && { resume_text: plainText.slice(0, 20000) }),
    }).eq('id', resume_version_id);

    return { status: 'completed', resume_version_id };
  } catch (err) {
    fastify.log.error(err);
    await supabase.from('resume_versions').update({
      generation_status: 'failed',
      error_message: err.message,
    }).eq('id', resume_version_id);

    return reply.code(500).send({ error: err.message });
  }
});

// ─── Elite STAR Bullet + Summary Generation ───────────────────────────────────
async function generateBullets(candidate, job) {
  const expYears = candidate.years_of_experience ?? 5;
  const maxRoles = expYears <= 5 ? 3 : 5;
  const maxBulletsRecent = expYears <= 5 ? 4 : 6;
  const maxBulletsOlder = expYears <= 5 ? 3 : 4;

  const jd = (job.jd_clean || job.jd_raw || '').slice(0, 4000);

  const prompt = `You are an elite ATS resume writer. Your job is to ANALYZE the job description and TAILOR the resume so it scores 85+ on ATS systems (Workday, Taleo, Greenhouse, Lever, etc.).

GOAL: Produce content that will score 85+ on ATS. Extract and mirror job keywords, ensure 3-6% keyword density, use exact role titles and skill phrases from the JD where truthful.

CANDIDATE:
Name: ${candidate.full_name}
Title: ${candidate.primary_title}
Years experience: ${expYears}
Skills: ${JSON.stringify(candidate.skills)}
Tools: ${JSON.stringify(candidate.tools || [])}

EXPERIENCE:
${JSON.stringify(candidate.experience, null, 2)}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Description:
${jd}

ANALYZE THE JD: Extract must-have skills, technologies, role keywords, industry terms. Weave these NATURALLY into the summary and bullets. The resume must pass ATS parsing (scannable in 6 seconds, keyword density 3-6%, no formatting that breaks parsing).

ELITE STAR BULLET RULES (MANDATORY):
- Formula: Action Verb + Scope + Method + Measurable Outcome
- Each bullet: 18-32 words, at least one number
- Use elite verbs ONLY: Architected, Engineered, Orchestrated, Automated, Optimized, Accelerated, Reduced, Increased, Implemented, Delivered, Led, Directed, Rebuilt, Transformed
- FORBIDDEN: "responsible for", "assisted with", "helped", "various", "several", "dynamic", "hardworking", "passionate", "worked on"
- NO repetition across roles. Prioritize: revenue metric, cost reduction, efficiency/time, scale (users/records), accuracy/quality
- Recent roles: ${maxBulletsRecent} bullets. Older roles: ${maxBulletsOlder} bullets. Max ${maxRoles} roles.
- DO NOT invent facts. ONLY rewrite existing responsibilities with quantifiable impact where data supports it.
- Embed JD keywords naturally (3-6% density) to maximize ATS score toward 85+.

PROFESSIONAL SUMMARY (3-5 lines, single paragraph):
- Start with target role title or close variant from the JD
- Formula: [Title] with X years of experience in [domain from JD]. Specializes in [JD-relevant strengths]. Delivered measurable impact including [metric] and [metric]. Experienced supporting [stakeholder level].
- NO adjectives: dynamic, motivated, hardworking, passionate.
- Include 2 quantified achievements, domain, core tools. Use JD terminology.

OUTPUT FORMAT (return ONLY this JSON, no markdown):
{"summary":"...","experience":[{"company":"...","title":"...","bullets":["...","..."]}]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';

  try {
    const parsed = JSON.parse(text);
    // New format: { summary, experience }; legacy: [{ company, title, bullets }]
    if (parsed && Array.isArray(parsed.experience)) {
      return { summary: parsed.summary || '', experience: parsed.experience };
    }
    if (Array.isArray(parsed)) return { summary: '', experience: parsed };
    return { summary: '', experience: [] };
  } catch {
    const objMatch = text.match(/\{[\s\S]*\}/);
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (objMatch) {
      try {
        const p = JSON.parse(objMatch[0]);
        return { summary: p.summary || '', experience: Array.isArray(p.experience) ? p.experience : [] };
      } catch (_) {}
    }
    if (arrMatch) return { summary: '', experience: JSON.parse(arrMatch[0]) };
    return { summary: '', experience: [] };
  }
}

// ─── LaTeX Template Builder ──────────────────────────────────────────────────
function buildLatex(candidate, bullets, job) {
  const esc = (s) => (s || '').replace(/[&%$#_{}~^\\]/g, (m) => `\\${m}`);
  const skills = (candidate.skills || []).map(esc).join(' $\\cdot$ ');

  const experienceBlocks = (bullets || []).map(role => {
    const bulletItems = (role.bullets || []).map(b => `    \\item ${esc(b)}`).join('\n');
    return `\\textbf{${esc(role.title)}} \\hfill ${esc(role.company)}
\\begin{itemize}[leftmargin=1.5em, itemsep=2pt, parsep=0pt]
${bulletItems}
\\end{itemize}`;
  }).join('\n\\vspace{6pt}\n');

  const educationBlocks = (candidate.education || []).map(ed =>
    `\\textbf{${esc(ed.degree)} in ${esc(ed.field)}} \\hfill ${esc(ed.institution)} $|$ ${esc(ed.graduation_date)}`
  ).join('\n\n');

  const certBlocks = (candidate.certifications || []).map(c =>
    `${esc(c.name)} — ${esc(c.issuer)} (${esc(c.date)})`
  ).join(' $\\cdot$ ');

  return `\\documentclass[11pt,letterpaper]{article}
\\usepackage[margin=0.6in]{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{titlesec}
\\usepackage{xcolor}

\\definecolor{headerblue}{HTML}{2B4C7E}

\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\titleformat{\\section}{\\large\\bfseries\\color{headerblue}}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{10pt}{6pt}

\\begin{document}

% ─── Header ───────────────────────────────────
\\begin{center}
{\\LARGE\\bfseries ${esc(candidate.full_name)}}\\\\[4pt]
{\\small ${[candidate.email, candidate.phone, candidate.location].filter(Boolean).map(esc).join(' $|$ ')}}
${candidate.linkedin_url ? `\\\\[2pt]{\\small \\href{${candidate.linkedin_url}}{LinkedIn}}` : ''}
\\end{center}

${candidate.summary ? `\\section{Summary}
${esc(candidate.summary)}` : ''}

\\section{Skills}
${skills}

\\section{Experience}
${experienceBlocks}

\\section{Education}
${educationBlocks}

${certBlocks ? `\\section{Certifications}
${certBlocks}` : ''}

\\end{document}`;
}

function buildSimplifiedLatex(candidate, bullets, job) {
  const esc = (s) => (s || '').replace(/[&%$#_{}~^\\]/g, (m) => `\\${m}`);

  const expText = (bullets || []).map(role => {
    const items = (role.bullets || []).map(b => `\\item ${esc(b)}`).join('\n');
    return `\\textbf{${esc(role.title)}} -- ${esc(role.company)}\n\\begin{itemize}\n${items}\n\\end{itemize}`;
  }).join('\n');

  return `\\documentclass[11pt]{article}
\\usepackage[margin=0.7in]{geometry}
\\usepackage{enumitem}
\\pagestyle{empty}
\\begin{document}
{\\Large\\bfseries ${esc(candidate.full_name)}}\\\\
${esc(candidate.email || '')} | ${esc(candidate.phone || '')} | ${esc(candidate.location || '')}
\\bigskip
\\textbf{Skills:} ${(candidate.skills || []).map(esc).join(', ')}
\\bigskip
${expText}
\\end{document}`;
}

// ─── PDF fallback (no Tectonic required) ─────────────────────────────────────
function wrapLines(text, maxChars) {
  if (!text || !String(text).trim()) return [];
  const str = String(text).trim();
  const lines = [];
  let remaining = str;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }
    const chunk = remaining.slice(0, maxChars);
    const lastSpace = chunk.lastIndexOf(' ');
    const breakAt = lastSpace > 0 ? lastSpace + 1 : maxChars;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  return lines;
}

async function buildPdfWithPdfLib(candidate, bullets, job) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const margin = 50;
  const lineHeight = 14;
  const titleSize = 18;
  const headingSize = 12;
  const bodySize = 10;
  let y = 742;

  const drawText = (str, size = bodySize, useBold = false) => {
    const f = useBold ? fontBold : font;
    wrapLines(str, 85).forEach((line) => {
      if (y < margin + lineHeight) return;
      page.drawText(line, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= lineHeight;
    });
  };

  page.drawText(candidate.full_name || 'Resume', {
    x: margin, y, size: titleSize, font: fontBold, color: rgb(0.1, 0.2, 0.4),
  });
  y -= lineHeight * 1.5;

  const contact = [candidate.email, candidate.phone, candidate.location].filter(Boolean).join('  |  ');
  if (contact) {
    drawText(contact, bodySize);
    y -= 4;
  }

  if (candidate.summary) {
    y -= 4;
    page.drawText('Summary', { x: margin, y, size: headingSize, font: fontBold, color: rgb(0.1, 0.2, 0.4) });
    y -= lineHeight;
    drawText(candidate.summary);
    y -= 6;
  }

  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
  if (skills.length > 0) {
    page.drawText('Skills', { x: margin, y, size: headingSize, font: fontBold, color: rgb(0.1, 0.2, 0.4) });
    y -= lineHeight;
    drawText(skills.map((s) => (typeof s === 'string' ? s : String(s))).join(', '));
    y -= 6;
  }

  if (bullets && bullets.length > 0) {
    page.drawText('Experience', { x: margin, y, size: headingSize, font: fontBold, color: rgb(0.1, 0.2, 0.4) });
    y -= lineHeight;
    for (const role of bullets) {
      const title = [role.title, role.company].filter(Boolean).join(' — ');
      if (title) {
        drawText(title, bodySize, true);
        y -= 2;
      }
      for (const b of role.bullets || []) {
        drawText('• ' + b);
      }
      y -= 4;
    }
  }

  const education = candidate.education || [];
  if (education.length > 0) {
    y -= 4;
    page.drawText('Education', { x: margin, y, size: headingSize, font: fontBold, color: rgb(0.1, 0.2, 0.4) });
    y -= lineHeight;
    for (const ed of education) {
      const line = [ed.degree, ed.field, ed.institution, ed.graduation_date].filter(Boolean).join(' — ');
      if (line) drawText(line);
    }
  }

  return Buffer.from(await doc.save());
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function updateStatus(id, status) {
  await supabase.from('resume_versions').update({ generation_status: status }).eq('id', id);
}

// ─── Start Server ────────────────────────────────────────────────────────────
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { fastify.log.error(err); process.exit(1); }
  fastify.log.info(`Resume Worker running on port ${PORT}`);
});
