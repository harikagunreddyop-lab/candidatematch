/**
 * ATS-Optimized Resume Builder — Elite Engine
 * Workday, Taleo, iCIMS, SAP SuccessFactors, Greenhouse, Lever, SmartRecruiters, Workable
 *
 * GLOBAL RULES: Single column, no tables/icons/graphics/hyperlinks/colors/italics.
 * Black text only. Sans-serif (Helvetica). 0.5" margins. Line spacing 1.1–1.15.
 *
 * STRUCTURE: NAME → Professional Title → Contact → PROFESSIONAL SUMMARY →
 *   CORE COMPETENCIES → TECHNICAL SKILLS → PROFESSIONAL EXPERIENCE →
 *   EDUCATION → CERTIFICATIONS
 *
 * HEADER: Name 16–18pt bold ALL CAPS; Title 12–13pt bold; Contact 11–12pt, pipe-separated.
 * Experience: TITLE | Company | Location | MM/YYYY – MM/YYYY (en dash, Present)
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// Page & margins — 0.5" all sides (720 DXA = 36pt)
const MARGIN = 36;
const PAGE_WIDTH = 612;   // US Letter 8.5"
const PAGE_HEIGHT = 792;  // US Letter 11"
const BLACK = rgb(0, 0, 0);

// Font sizes (pt) — Elite spec
const SZ_BODY = 10.5;    // Body text
const SZ_NAME = 17;      // Name 16–18pt
const SZ_TITLE_BAR = 12; // Professional title 12–13pt
const SZ_CONTACT = 11;   // Contact 11–12pt

// Bullet indent: Left 300 DXA = 15pt, hanging 180 DXA = 9pt
const BULLET_INDENT = 15;

// Spacing (points) — 1 line between sections, line spacing ~1.15
const LINE_HEIGHT = 12;  // ~1.15 × 10.5pt
const SP = {
  name: 8,
  title: 6,
  contact: 14,
  headerBefore: LINE_HEIGHT,
  headerAfter: 6,
  jobBefore: 13,
  jobAfter: 9,
  bulletAfter: 9,
  skillAfter: 9,
  summaryAfter: 10,
  eduAfter: 8,
};

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

function ensurePage(doc, pages, y, margin, lineHeight) {
  if (y < margin + lineHeight * 3) {
    pages.push(doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]));
    return PAGE_HEIGHT - MARGIN;
  }
  return y;
}

/**
 * Map candidate + bullets + job to ATS-friendly structure
 * @param {string} [generatedSummary] - Elite summary overrides candidate.summary
 */
function toAtsCandidate(candidate, bullets, job, generatedSummary) {
  const titleBar = [
    candidate.primary_title,
    job?.title,
    ...(candidate.target_job_titles || []).filter(Boolean),
  ]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5)
    .join('  |  ') || candidate.primary_title || 'Professional';

  const contact = [
    candidate.location,
    candidate.phone,
    candidate.email,
    candidate.linkedin_url ? `linkedin.com/in/${(candidate.linkedin_url || '').split('/').pop() || 'profile'}` : null,
  ].filter(Boolean);

  const skills = candidate.skills || [];
  const coreCompetencies = [];
  const technicalSkills = [];
  if (skills.length > 0) {
    const chunkSize = Math.ceil(skills.length / 4);
    const coreCats = ['Domain Expertise', 'Core Competencies'];
    const techCats = ['Technical Skills', 'Tools & Platforms'];
    skills.forEach((s, i) => {
      const idx = Math.min(Math.floor(i / chunkSize), 3);
      const cat = idx < 2 ? coreCats[idx] : techCats[idx - 2];
      const skillStr = typeof s === 'string' ? s : String(s);
      if (idx < 2) {
        const existing = coreCompetencies.find(sc => sc.category === cat);
        if (existing) existing.skills.push(skillStr);
        else coreCompetencies.push({ category: cat, skills: [skillStr] });
      } else {
        const existing = technicalSkills.find(sc => sc.category === cat);
        if (existing) existing.skills.push(skillStr);
        else technicalSkills.push({ category: cat, skills: [skillStr] });
      }
    });
  }
  if (coreCompetencies.length === 0 && technicalSkills.length === 0) {
    coreCompetencies.push({ category: 'Core Competencies', skills: ['See experience below'] });
  }

  const exp = candidate.experience || [];
  const formatDate = (d) => {
    if (!d) return '';
    const s = String(d);
    if (/^\d{4}-\d{2}/.test(s)) return s.slice(5, 7) + '/' + s.slice(0, 4); // YYYY-MM -> MM/YYYY
    if (/^\d{2}\/\d{4}$/.test(s)) return s;
    return s;
  };
  const experience = (bullets || []).map(role => {
    const orig = exp.find(e =>
      String(e.company || '').toLowerCase() === String(role.company || '').toLowerCase() ||
      String(e.title || '').toLowerCase() === String(role.title || '').toLowerCase()
    );
    const startFmt = formatDate(orig?.start_date || '');
    const endFmt = orig?.current ? 'Present' : formatDate(orig?.end_date || '');
    const dates = (startFmt && endFmt) ? `${startFmt} – ${endFmt}` : (orig?.current ? `${orig.start_date || ''} – Present` : `${orig?.start_date || ''} – ${orig?.end_date || ''}`) || role.dates || '';
    const location = orig?.location || role.location || '';
    return {
      title: role.title || orig?.title || 'Role',
      company: role.company || orig?.company || 'Company',
      location,
      dates,
      bullets: role.bullets || [],
    };
  });

  const education = (candidate.education || []).map(ed => {
    if (typeof ed === 'string') return ed;
    const degreePart = [ed.degree, ed.field].filter(Boolean).join(' in ');
    const parts = [degreePart, ed.institution, ed.graduation_date].filter(Boolean);
    return parts.join('  |  ');
  });

  return {
    name: candidate.full_name || 'Resume',
    titleBar,
    contact,
    summary: (generatedSummary && String(generatedSummary).trim()) || candidate.summary || candidate.default_pitch || '',
    coreCompetencies: coreCompetencies.map(sc => ({ category: sc.category, skills: sc.skills.join(', ') })),
    technicalSkills: technicalSkills.map(sc => ({ category: sc.category, skills: sc.skills.join(', ') })),
    experience,
    education,
    certifications: (candidate.certifications || []).map(c =>
      typeof c === 'string' ? c : `${c.name || ''}  |  ${c.issuer || ''}  |  ${c.date || ''}`.trim()
    ).filter(Boolean),
    projects: [],
  };
}

/**
 * Build ATS-optimized PDF from candidate + bullets + job
 * @param {Object} candidate - Candidate data
 * @param {Array} bullets - Experience roles with STAR bullets
 * @param {Object} job - Target job
 * @param {string} [generatedSummary] - Elite professional summary (overrides candidate.summary)
 */
async function buildAtsPdf(candidate, bullets, job, generatedSummary) {
  const ats = toAtsCandidate(candidate, bullets, job, generatedSummary);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = [doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])];

  let y = PAGE_HEIGHT - MARGIN;

  const drawText = (str, size, useBold, indent = 0) => {
    const f = useBold ? fontBold : font;
    const x = MARGIN + indent;
    wrapLines(str, 78).forEach((line) => {
      y = ensurePage(doc, pages, y, MARGIN, LINE_HEIGHT);
      const p = pages[pages.length - 1];
      p.drawText(line, { x, y, size, font: f, color: BLACK });
      y -= LINE_HEIGHT;
    });
  };

  const page = pages[0];

  // Name — 16–18pt, bold, ALL CAPS
  const name = (ats.name || 'Resume').toUpperCase();
  page.drawText(name, {
    x: MARGIN, y, size: SZ_NAME, font: fontBold, color: BLACK,
  });
  y -= LINE_HEIGHT + SP.name;

  // Professional title — 12–13pt bold
  if (ats.titleBar) {
    drawText(ats.titleBar, SZ_TITLE_BAR, true);
    y -= SP.title;
  }

  // Contact — 11–12pt, pipe-separated
  if (ats.contact.length > 0) {
    drawText(ats.contact.join('  |  '), SZ_CONTACT, false);
    y -= SP.contact;
  }

  // PROFESSIONAL SUMMARY — section header ALL CAPS bold, body 10.5pt
  if (ats.summary) {
    y -= SP.headerBefore;
    const p = pages[pages.length - 1];
    p.drawText('PROFESSIONAL SUMMARY', {
      x: MARGIN, y, size: SZ_BODY, font: fontBold, color: BLACK,
    });
    y -= LINE_HEIGHT + SP.headerAfter;
    drawText(ats.summary, SZ_BODY, false);
    y -= SP.summaryAfter;
  }

  const renderSkillSection = (sectionTitle, skillRows) => {
    if (skillRows.length === 0) return;
    y -= SP.headerBefore;
    y = ensurePage(doc, pages, y, MARGIN, LINE_HEIGHT);
    const p = pages[pages.length - 1];
    p.drawText(sectionTitle, {
      x: MARGIN, y, size: SZ_BODY, font: fontBold, color: BLACK,
    });
    y -= LINE_HEIGHT + SP.headerAfter;
    for (const sc of skillRows) {
      y = ensurePage(doc, pages, y, MARGIN, LINE_HEIGHT);
      const pg = pages[pages.length - 1];
      const catStr = sc.category + ': ';
      const catWidth = fontBold.widthOfTextAtSize(catStr, SZ_BODY);
      pg.drawText(catStr, { x: MARGIN, y, size: SZ_BODY, font: fontBold, color: BLACK });
      const skillsWrapped = wrapLines(sc.skills, 65);
      skillsWrapped.forEach((line) => {
        y = ensurePage(doc, pages, y, MARGIN, LINE_HEIGHT);
        const px = pages[pages.length - 1];
        px.drawText(line, { x: MARGIN + catWidth, y, size: SZ_BODY, font, color: BLACK });
        y -= LINE_HEIGHT;
      });
      y -= SP.skillAfter;
    }
  };

  renderSkillSection('CORE COMPETENCIES', ats.coreCompetencies || []);
  renderSkillSection('TECHNICAL SKILLS', ats.technicalSkills || []);

  // PROFESSIONAL EXPERIENCE — Title | Company | Location | MM/YYYY – MM/YYYY
  y -= SP.headerBefore;
  y = ensurePage(doc, pages, y, MARGIN, LINE_HEIGHT);
  const pExp = pages[pages.length - 1];
  pExp.drawText('PROFESSIONAL EXPERIENCE', {
    x: MARGIN, y, size: SZ_BODY, font: fontBold, color: BLACK,
  });
  y -= LINE_HEIGHT + SP.headerAfter;

  for (const role of ats.experience) {
    const header = [role.title, role.company, role.location, role.dates].filter(Boolean).join('  |  ');
    if (header) {
      drawText(header, SZ_BODY, true);
      y -= SP.jobAfter;
    }
    for (const b of role.bullets) {
      drawText(`• ${b}`, SZ_BODY, false, BULLET_INDENT);
      y -= SP.bulletAfter;
    }
    y -= SP.jobBefore;
  }

  // EDUCATION — Degree | University | Location | MM/YYYY
  if (ats.education.length > 0) {
    y -= SP.headerBefore;
    y = ensurePage(doc, pages, y, MARGIN, LINE_HEIGHT);
    const pEdu = pages[pages.length - 1];
    pEdu.drawText('EDUCATION', {
      x: MARGIN, y, size: SZ_BODY, font: fontBold, color: BLACK,
    });
    y -= LINE_HEIGHT + SP.headerAfter;
    for (const line of ats.education) {
      if (line) {
        drawText(line, SZ_BODY, false);
        y -= SP.eduAfter;
      }
    }
  }

  // CERTIFICATIONS
  if (ats.certifications.length > 0) {
    y -= SP.headerBefore;
    y = ensurePage(doc, pages, y, MARGIN, LINE_HEIGHT);
    const pCert = pages[pages.length - 1];
    pCert.drawText('CERTIFICATIONS', {
      x: MARGIN, y, size: SZ_BODY, font: fontBold, color: BLACK,
    });
    y -= LINE_HEIGHT + SP.headerAfter;
    for (const line of ats.certifications) {
      if (line) {
        drawText(line, SZ_BODY, false);
        y -= SP.eduAfter;
      }
    }
  }

  return Buffer.from(await doc.save());
}

module.exports = { buildAtsPdf, toAtsCandidate };
