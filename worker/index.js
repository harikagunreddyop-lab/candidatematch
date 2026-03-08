const path = require('path');
// Load .env from project root (parent of worker/)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fastify = require('fastify')({ logger: true, bodyLimit: 1_048_576 /* 1 MB */ });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { defaultGenerator } = require('./lib/fast-generator');

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WORKER_SECRET = process.env.WORKER_SECRET;
const PORT = process.env.PORT || process.env.WORKER_PORT || 3001;
const TEMP_DIR = path.join(__dirname, 'tmp');
const REDIS_URL = process.env.REDIS_URL || (process.env.REDIS_HOST && process.env.REDIS_PORT
  ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}` : null);

let resumeQueue = null;
let resumeWorker = null;
let queueEvents = null;
if (REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    const { Queue, Worker, QueueEvents } = require('bullmq');
    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const queueName = 'resume-generation';
    resumeQueue = new Queue(queueName, { connection });
    queueEvents = new QueueEvents(queueName, { connection });
    resumeWorker = new Worker(queueName, async (job) => {
      return await runGeneration(job.data, job);
    }, { connection, concurrency: 10 });
    fastify.log.info('BullMQ worker attached to queue resume-generation');
  } catch (e) {
    fastify.log.warn('BullMQ setup failed, using inline generation: ' + e.message);
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (project root)');
  process.exit(1);
}

if (!WORKER_SECRET) {
  console.warn('WARNING: WORKER_SECRET not set — worker is unauthenticated (dev only)');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Health / generation metrics ───────────────────────────────────────────
const metrics = {
  totalGenerations: 0,
  successCount: 0,
  lastDurationMs: null,
  lastError: null,
  lastCompletedAt: null,
};

// Ensure temp directory
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─── Auth Hook — protect all non-health routes ──────────────────────────────
fastify.addHook('preHandler', async (request, reply) => {
  // Skip auth for health check
  if (request.routeOptions?.url === '/health' || request.url === '/health') return;

  if (WORKER_SECRET) {
    const provided = request.headers['x-worker-secret'];
    if (!provided || provided !== WORKER_SECRET) {
      reply.code(401).send({ error: 'Unauthorized: invalid or missing X-Worker-Secret' });
      return;
    }
  }
});

// ─── Health Check ────────────────────────────────────────────────────────────
fastify.get('/health', async () => {
  const stats = defaultGenerator.getStats();
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    metrics: {
      totalGenerations: metrics.totalGenerations,
      successCount: metrics.successCount,
      successRate: metrics.totalGenerations ? (metrics.successCount / metrics.totalGenerations * 100).toFixed(1) + '%' : null,
      lastDurationMs: metrics.lastDurationMs,
      lastError: metrics.lastError,
      lastCompletedAt: metrics.lastCompletedAt,
      cacheSize: stats.cacheSize,
      maxCacheSize: stats.maxCacheSize,
    },
    queue: REDIS_URL ? 'bullmq' : 'inline',
  };
});

// ─── Generate Resume Endpoint (Elite pipeline + optional BullMQ) ──────────────
async function runGeneration(payload, progressJob = null) {
  const { resume_version_id, candidate, job, file_path, pdf_path, templateType } = payload;
  const storagePath = file_path || pdf_path;

  const progress = (stage) => {
    if (progressJob && typeof progressJob.updateProgress === 'function') {
      progressJob.updateProgress({ stage }).catch(() => {});
    }
  };

  progress('generating');
  await updateStatus(resume_version_id, 'generating');
  const result = await defaultGenerator.generate(candidate, job, {
    templateKey: templateType || undefined,
    forceRegenerate: false,
  });

  const docxBuffer = result.buffer;
  const sizeKB = docxBuffer.length / 1024;
  if (sizeKB < 1) throw new Error('DOCX too small, likely empty');

  progress('uploading');
  await updateStatus(resume_version_id, 'uploading');
  const { error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, docxBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  await supabase.from('resume_versions').update({
    generation_status: 'completed',
    bullets: result.bullets || [],
    pdf_path: storagePath,
    ...(result.plainText && { resume_text: result.plainText.slice(0, 20000) }),
  }).eq('id', resume_version_id);

  progress('completed');
  return {
    resume_version_id,
    duration: result.duration,
    atsScore: result.atsScore,
    cached: result.cached,
    buffer: docxBuffer,
    storagePath,
  };
}

fastify.post('/generate', async (request, reply) => {
  const { resume_version_id, candidate, job, pdf_path, file_path, templateType } = request.body || {};
  const storagePath = file_path || pdf_path;
  const streamResponse = request.query && request.query.stream === '1';

  if (!resume_version_id || !candidate || !job || !storagePath) {
    return reply.code(400).send({
      error: 'Missing required fields: resume_version_id, candidate, job, pdf_path or file_path',
    });
  }

  if (!ANTHROPIC_KEY) {
    fastify.log.warn('ANTHROPIC_API_KEY not set; resume generation may have empty bullets');
  }

  const startTime = Date.now();
  metrics.totalGenerations += 1;

  try {
    let result;
    if (REDIS_URL && resumeQueue && resumeWorker && queueEvents) {
      const jobId = `gen-${resume_version_id}-${Date.now()}`;
      const job = await resumeQueue.add('generate', {
        resume_version_id,
        candidate,
        job,
        file_path: storagePath,
        pdf_path,
        templateType,
      }, { jobId, removeOnComplete: { count: 100 } });
      result = await job.waitUntilFinished(queueEvents, 30000);
    } else {
      result = await runGeneration({
        resume_version_id,
        candidate,
        job,
        file_path: storagePath,
        pdf_path,
        templateType,
      }, null);
    }

    metrics.successCount += 1;
    metrics.lastDurationMs = result.duration ?? (Date.now() - startTime);
    metrics.lastError = null;
    metrics.lastCompletedAt = new Date().toISOString();

    if (streamResponse && result.buffer) {
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      reply.header('Content-Disposition', 'attachment; filename="resume.docx"');
      const CHUNK = 64 * 1024;
      const buf = result.buffer;
      for (let i = 0; i < buf.length; i += CHUNK) {
        reply.raw.write(buf.slice(i, i + CHUNK));
      }
      reply.raw.end();
      return;
    }

    return {
      status: 'completed',
      resume_version_id: result.resume_version_id,
      duration: result.duration,
      atsScore: result.atsScore,
      cached: result.cached,
      resumeUrl: result.storagePath,
      optimizations: result.atsScore >= 90 ? ['ats-optimized', 'keyword-density'] : [],
    };
  } catch (err) {
    fastify.log.error(err);
    metrics.lastError = err.message;
    await supabase.from('resume_versions').update({
      generation_status: 'failed',
      error_message: err.message,
    }).eq('id', resume_version_id);

    return reply.code(500).send({ error: err.message });
  }
});
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

// ─── V3 Render Endpoint (no LLM — content_json → DOCX + upload) ────────────
fastify.post('/render', async (request, reply) => {
  const { artifact_id, candidate_id, content_json, template_id } = request.body || {};

  if (!artifact_id || !candidate_id || !content_json) {
    return reply.code(400).send({ error: 'Missing: artifact_id, candidate_id, content_json' });
  }

  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');

    const content = content_json;
    const children = [];

    // ── Name ──
    children.push(new Paragraph({
      children: [new TextRun({ text: content.candidateName || 'Resume', bold: true, size: 28, font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }));

    // ── Contact ──
    if (content.contactLine) {
      children.push(new Paragraph({
        children: [new TextRun({ text: content.contactLine, size: 20, font: 'Calibri' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }));
    }

    // ── Section divider helper ──
    const addSectionHeader = (title) => {
      children.push(new Paragraph({
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 22, font: 'Calibri' })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, space: 1, color: '000000' } },
      }));
    };

    // ── Summary ──
    if (content.summary) {
      addSectionHeader('Professional Summary');
      children.push(new Paragraph({
        children: [new TextRun({ text: content.summary, size: 21, font: 'Calibri' })],
        spacing: { after: 120 },
      }));
    }

    // ── Skills ──
    if (content.skills && content.skills.length > 0) {
      addSectionHeader('Core Competencies');
      for (const cat of content.skills) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${cat.category}: `, bold: true, size: 21, font: 'Calibri' }),
            new TextRun({ text: cat.items.join(', '), size: 21, font: 'Calibri' }),
          ],
          spacing: { after: 40 },
        }));
      }
    }

    // ── Experience ──
    if (content.experience && content.experience.length > 0) {
      addSectionHeader('Professional Experience');
      for (const role of content.experience) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: role.title || '', bold: true, size: 21, font: 'Calibri' }),
            new TextRun({ text: role.company ? ` — ${role.company}` : '', size: 21, font: 'Calibri' }),
          ],
          spacing: { before: 120, after: 40 },
        }));
        if (role.dates) {
          children.push(new Paragraph({
            children: [new TextRun({ text: role.dates, size: 20, font: 'Calibri', italics: false })],
            spacing: { after: 40 },
          }));
        }
        for (const bullet of role.bullets || []) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `• ${bullet}`, size: 21, font: 'Calibri' })],
            spacing: { after: 20 },
            indent: { left: 360 },
          }));
        }
      }
    }

    // ── Education ──
    if (content.education && content.education.length > 0) {
      addSectionHeader('Education');
      for (const ed of content.education) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${ed.degree} in ${ed.field}`, bold: true, size: 21, font: 'Calibri' }),
            new TextRun({ text: ` — ${ed.institution} (${ed.date})`, size: 21, font: 'Calibri' }),
          ],
          spacing: { after: 40 },
        }));
      }
    }

    // ── Certifications ──
    if (content.certifications && content.certifications.length > 0) {
      addSectionHeader('Certifications');
      for (const cert of content.certifications) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `${cert.name} — ${cert.issuer} (${cert.date})`, size: 21, font: 'Calibri' })],
          spacing: { after: 40 },
        }));
      }
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } }, // 0.5 inch
        },
        children,
      }],
    });

    const docxBuffer = await Packer.toBuffer(doc);

    // Upload DOCX to Supabase Storage
    const storagePath = `generated/${candidate_id}/${artifact_id}.docx`;
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(storagePath, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    return { docx_url: storagePath, pdf_url: null, status: 'ready' };
  } catch (err) {
    fastify.log.error(err);
    return reply.code(500).send({ error: err.message });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function updateStatus(id, status) {
  await supabase.from('resume_versions').update({ generation_status: status }).eq('id', id);
}

// ─── Start Server ────────────────────────────────────────────────────────────
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { fastify.log.error(err); process.exit(1); }
  fastify.log.info(`Resume Worker running on port ${PORT}`);
});
