/**
 * Elite DOCX formatting engine — template-driven, ATS-safe
 * Uses elite-ats-template configs for margins, fonts, spacing.
 * Single column, no tables/columns/graphics. Calibri/Arial only.
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} = require('docx');
const { getTemplate } = require('../templates/elite-ats-template');

function twip(inch) {
  return convertInchesToTwip(inch);
}

/**
 * Create elite-formatted resume DOCX from ATS data + template key
 * @param {Object} ats - toAtsCandidate() output
 * @param {string} [templateKey] - techElite | executive | creative | finance | generalProfessional
 * @returns {Promise<{buffer: Buffer, plainText: string}>}
 */
async function createEliteResume(ats, templateKey) {
  const template = getTemplate(templateKey || 'techElite');
  const fmt = template.formatting;
  const font = fmt.font || 'Calibri';
  const sz = fmt.fontSize || { header: 28, titleBar: 22, body: 21, sectionHeader: 21 };
  const margins = fmt.margins || { top: 0.5, bottom: 0.5, left: 0.7, right: 0.7 };
  const spacingBefore = (fmt.sectionSpacingBefore ?? 12) * 20;
  const bulletChar = fmt.bulletStyle || '•';

  const children = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: (ats.name || 'Resume').toUpperCase(), bold: true, size: sz.header || 28, font })],
      spacing: { after: 100 },
    })
  );
  if (ats.titleBar) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: ats.titleBar, bold: true, size: sz.titleBar || 22, font })],
        spacing: { after: 80 },
      })
    );
  }
  if (ats.contact && ats.contact.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: ats.contact.join('  |  '), size: sz.titleBar || 20, font })],
        spacing: { after: 200 },
      })
    );
  }

  if (ats.summary) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'PROFESSIONAL SUMMARY', bold: true, size: sz.sectionHeader || sz.body, font })],
        spacing: { before: spacingBefore, after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: ats.summary, size: sz.body, font })],
        spacing: { after: 160 },
      })
    );
  }

  const renderSkillSection = (title, rows) => {
    if (!rows || !rows.length) return;
    children.push(
      new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: sz.sectionHeader || sz.body, font })],
        spacing: { before: spacingBefore, after: 100 },
      })
    );
    for (const sc of rows) {
      const skillsStr = Array.isArray(sc.skills) ? sc.skills.join(', ') : sc.skills;
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: (sc.category || '') + ': ', bold: true, size: sz.body, font }),
            new TextRun({ text: skillsStr || '', size: sz.body, font }),
          ],
          spacing: { after: 100 },
        })
      );
    }
  };
  renderSkillSection('CORE COMPETENCIES', ats.coreCompetencies || []);
  renderSkillSection('TECHNICAL SKILLS', ats.technicalSkills || []);

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'PROFESSIONAL EXPERIENCE', bold: true, size: sz.sectionHeader || sz.body, font })],
      spacing: { before: spacingBefore, after: 100 },
    })
  );
  for (const role of ats.experience || []) {
    const header = [role.title, role.company, role.location, role.dates].filter(Boolean).join('  |  ');
    if (header) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: header, bold: true, size: sz.body, font })],
          spacing: { before: 120, after: 80 },
        })
      );
    }
    for (const b of role.bullets || []) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: bulletChar + ' ', size: sz.body, font }),
            new TextRun({ text: b, size: sz.body, font }),
          ],
          indent: { left: twip(0.21), hanging: twip(0.1) },
          spacing: { after: 100 },
        })
      );
    }
  }

  if (ats.education && ats.education.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'EDUCATION', bold: true, size: sz.sectionHeader || sz.body, font })],
        spacing: { before: spacingBefore, after: 100 },
      })
    );
    for (const line of ats.education) {
      if (line) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, size: sz.body, font })],
            spacing: { after: 80 },
          })
        );
      }
    }
  }

  if (ats.certifications && ats.certifications.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'CERTIFICATIONS', bold: true, size: sz.sectionHeader || sz.body, font })],
        spacing: { before: spacingBefore, after: 100 },
      })
    );
    for (const line of ats.certifications) {
      if (line) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, size: sz.body, font })],
            spacing: { after: 80 },
          })
        );
      }
    }
  }

  const doc = new Document({
    creator: 'CandidateMatch Elite',
    title: 'Resume',
    sections: [{
      properties: {
        page: {
          margin: {
            top: twip(margins.top),
            right: twip(margins.right),
            bottom: twip(margins.bottom),
            left: twip(margins.left),
          },
        },
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);

  const plainParts = [
    ats.name,
    ats.titleBar,
    (ats.contact || []).join(' | '),
    ats.summary,
    ...(ats.coreCompetencies || []).map((sc) => (sc.category || '') + ': ' + (Array.isArray(sc.skills) ? sc.skills.join(', ') : sc.skills)),
    ...(ats.technicalSkills || []).map((sc) => (sc.category || '') + ': ' + (Array.isArray(sc.skills) ? sc.skills.join(', ') : sc.skills)),
  ];
  for (const role of ats.experience || []) {
    plainParts.push([role.title, role.company, role.location, role.dates].filter(Boolean).join(' | '));
    plainParts.push(...(role.bullets || []));
  }
  plainParts.push(...(ats.education || []), ...(ats.certifications || []));
  const plainText = plainParts.filter(Boolean).join('\n');

  return { buffer, plainText };
}

module.exports = { createEliteResume };
