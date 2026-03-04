/**
 * ATS-Optimized Word (DOCX) Resume Builder — Elite Engine
 * Output: .docx for maximum ATS compatibility and easy editing.
 *
 * GLOBAL RULES: Single column, no tables/icons/graphics/hyperlinks/colors/italics.
 * Black text only. Arial/Calibri. 0.5" margins. Line spacing 1.1–1.15.
 *
 * STRUCTURE: NAME → Professional Title → Contact → PROFESSIONAL SUMMARY →
 *   CORE COMPETENCIES → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE →
 *   EDUCATION → CERTIFICATIONS
 *
 * HEADER: Name 14pt bold ALL CAPS; Title bar/contact 10pt.
 * Section headers: ALL CAPS, bold, 10.5pt. Body: 10.5pt.
 * Bullet indent: Left 300, hanging 180.
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} = require('docx');

const { toAtsCandidate } = require('./ats-resume-builder');

// Font sizes: half-points (21 = 10.5pt, 28 = 14pt)
const SZ_BODY = 21;      // 10.5pt
const SZ_NAME = 28;      // 14pt
const SZ_TITLE_CONTACT = 20;  // 10pt

const MARGIN = 0.5;  // inches

/**
 * Build ATS-optimized DOCX from candidate + bullets + job
 * @param {Object} candidate - Candidate data
 * @param {Array} bullets - Experience roles with STAR bullets
 * @param {Object} job - Target job
 * @param {string} [generatedSummary] - Elite professional summary
 * @returns {Promise<{buffer: Buffer, plainText: string}>}
 */
async function buildAtsDocx(candidate, bullets, job, generatedSummary) {
  const ats = toAtsCandidate(candidate, bullets, job, generatedSummary);
  const twip = (inch) => convertInchesToTwip(inch);

  const children = [];

  // ─── NAME — 14pt bold ALL CAPS ───────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: (ats.name || 'Resume').toUpperCase(),
          bold: true,
          size: SZ_NAME,
          font: 'Arial',
        }),
      ],
      spacing: { after: 100 },
    })
  );

  // ─── Professional Title — 10pt bold ──────────────────────────────────────
  if (ats.titleBar) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: ats.titleBar,
            bold: true,
            size: SZ_TITLE_CONTACT,
            font: 'Arial',
          }),
        ],
        spacing: { after: 80 },
      })
    );
  }

  // ─── Contact — 10pt, pipe-separated ──────────────────────────────────────
  if (ats.contact.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: ats.contact.join('  |  '),
            size: SZ_TITLE_CONTACT,
            font: 'Arial',
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // ─── PROFESSIONAL SUMMARY ────────────────────────────────────────────────
  if (ats.summary) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'PROFESSIONAL SUMMARY',
            bold: true,
            size: SZ_BODY,
            font: 'Arial',
          }),
        ],
        spacing: { before: 120, after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: ats.summary,
            size: SZ_BODY,
            font: 'Arial',
          }),
        ],
        spacing: { after: 160 },
      })
    );
  }

  // ─── CORE COMPETENCIES ───────────────────────────────────────────────────
  const renderSkillSection = (title, rows) => {
    if (!rows.length) return;
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: SZ_BODY,
            font: 'Arial',
          }),
        ],
        spacing: { before: 120, after: 100 },
      })
    );
    for (const sc of rows) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: sc.category + ': ',
              bold: true,
              size: SZ_BODY,
              font: 'Arial',
            }),
            new TextRun({
              text: sc.skills,
              size: SZ_BODY,
              font: 'Arial',
            }),
          ],
          spacing: { after: 100 },
        })
      );
    }
  };
  renderSkillSection('CORE COMPETENCIES', ats.coreCompetencies || []);
  renderSkillSection('TECHNICAL SKILLS', ats.technicalSkills || []);

  // ─── PROFESSIONAL EXPERIENCE ─────────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [
          new TextRun({
            text: 'PROFESSIONAL EXPERIENCE',
            bold: true,
            size: SZ_BODY,
            font: 'Arial',
          }),
      ],
      spacing: { before: 120, after: 100 },
    })
  );

  for (const role of ats.experience) {
    const header = [role.title, role.company, role.location, role.dates].filter(Boolean).join('  |  ');
    if (header) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: header,
              bold: true,
              size: SZ_BODY,
              font: 'Arial',
            }),
          ],
          spacing: { before: 120, after: 80 },
        })
      );
    }
    for (const b of role.bullets) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '• ',
              size: SZ_BODY,
              font: 'Arial',
            }),
            new TextRun({
              text: b,
              size: SZ_BODY,
              font: 'Arial',
            }),
          ],
          indent: { left: twip(0.21), hanging: twip(0.1) },
          spacing: { after: 100 },
        })
      );
    }
  }

  // ─── EDUCATION ───────────────────────────────────────────────────────────
  if (ats.education.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'EDUCATION',
            bold: true,
            size: SZ_BODY,
            font: 'Arial',
          }),
        ],
        spacing: { before: 120, after: 100 },
      })
    );
    for (const line of ats.education) {
      if (line) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: SZ_BODY,
                font: 'Arial',
              }),
            ],
            spacing: { after: 80 },
          })
        );
      }
    }
  }

  // ─── CERTIFICATIONS ──────────────────────────────────────────────────────
  if (ats.certifications.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'CERTIFICATIONS',
            bold: true,
            size: SZ_BODY,
            font: 'Arial',
          }),
        ],
        spacing: { before: 120, after: 100 },
      })
    );
    for (const line of ats.certifications) {
      if (line) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: SZ_BODY,
                font: 'Arial',
              }),
            ],
            spacing: { after: 80 },
          })
        );
      }
    }
  }

  const doc = new Document({
    creator: 'CandidateMatch',
    title: 'Resume',
    sections: [{
      properties: {
        page: {
          margin: {
            top: twip(MARGIN),
            right: twip(MARGIN),
            bottom: twip(MARGIN),
            left: twip(MARGIN),
          },
        },
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);

  // Build plain text for ATS scoring (stored in resume_versions.resume_text)
  const plainParts = [
    ats.name,
    ats.titleBar,
    ats.contact.join(' | '),
    ats.summary,
    ...(ats.coreCompetencies || []).map((sc) => sc.category + ': ' + sc.skills),
    ...(ats.technicalSkills || []).map((sc) => sc.category + ': ' + sc.skills),
  ];
  for (const role of ats.experience) {
    plainParts.push([role.title, role.company, role.location, role.dates].filter(Boolean).join(' | '));
    plainParts.push(...(role.bullets || []));
  }
  plainParts.push(...ats.education, ...ats.certifications);
  const plainText = plainParts.filter(Boolean).join('\n');

  return { buffer, plainText };
}

module.exports = { buildAtsDocx };
