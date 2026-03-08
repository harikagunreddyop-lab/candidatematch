/**
 * Elite ATS Resume Templates — Apple/Google/McKinsey/Goldman quality
 * 5 templates with ATS-safe formatting (no tables, columns, images).
 * Fonts: Calibri or Arial only for max ATS compatibility.
 */

const ELITE_TEMPLATES = {
  techElite: {
    id: 'techElite',
    name: 'Tech Elite',
    description: 'Software engineers, product — Google/Meta style',
    sections: ['header', 'summary', 'experience', 'projects', 'skills', 'education', 'certifications'],
    formatting: {
      font: 'Calibri',
      fontSize: { header: 28, titleBar: 22, body: 21, sectionHeader: 21 },
      margins: { top: 0.5, bottom: 0.5, left: 0.7, right: 0.7 },
      lineSpacing: 1.15,
      bulletStyle: '•',
      sectionSpacingBefore: 12,
      sectionSpacingAfter: 8,
    },
    atsOptimizations: [
      'keyword-density-target: 8-12%',
      'standard-section-headers',
      'no-tables-or-columns',
      'consistent-date-format: MM/YYYY',
      'skill-section-prominent',
    ],
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    description: 'C-level, directors — McKinsey style',
    sections: ['header', 'summary', 'experience', 'skills', 'education', 'certifications'],
    formatting: {
      font: 'Calibri',
      fontSize: { header: 28, titleBar: 22, body: 21, sectionHeader: 22 },
      margins: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
      lineSpacing: 1.15,
      bulletStyle: '•',
      sectionSpacingBefore: 14,
      sectionSpacingAfter: 8,
    },
    atsOptimizations: [
      'keyword-density-target: 6-10%',
      'standard-section-headers',
      'no-tables-or-columns',
      'consistent-date-format: MM/YYYY',
      'leadership-keywords',
    ],
  },
  creative: {
    id: 'creative',
    name: 'Creative',
    description: 'Designers, marketers — Apple style',
    sections: ['header', 'summary', 'experience', 'skills', 'education', 'certifications'],
    formatting: {
      font: 'Calibri',
      fontSize: { header: 28, titleBar: 22, body: 21, sectionHeader: 21 },
      margins: { top: 0.55, bottom: 0.55, left: 0.7, right: 0.7 },
      lineSpacing: 1.2,
      bulletStyle: '•',
      sectionSpacingBefore: 12,
      sectionSpacingAfter: 8,
    },
    atsOptimizations: [
      'keyword-density-target: 8-12%',
      'standard-section-headers',
      'no-tables-or-columns',
      'consistent-date-format: MM/YYYY',
      'achievement-focused',
    ],
  },
  finance: {
    id: 'finance',
    name: 'Finance',
    description: 'Banking, consulting — Goldman style',
    sections: ['header', 'summary', 'experience', 'skills', 'education', 'certifications'],
    formatting: {
      font: 'Calibri',
      fontSize: { header: 28, titleBar: 22, body: 21, sectionHeader: 21 },
      margins: { top: 0.5, bottom: 0.5, left: 0.7, right: 0.7 },
      lineSpacing: 1.12,
      bulletStyle: '•',
      sectionSpacingBefore: 12,
      sectionSpacingAfter: 8,
    },
    atsOptimizations: [
      'keyword-density-target: 6-10%',
      'standard-section-headers',
      'no-tables-or-columns',
      'consistent-date-format: MM/YYYY',
      'quantified-impact',
    ],
  },
  generalProfessional: {
    id: 'generalProfessional',
    name: 'General Professional',
    description: 'Universal ATS-optimized',
    sections: ['header', 'summary', 'experience', 'skills', 'education', 'certifications'],
    formatting: {
      font: 'Arial',
      fontSize: { header: 28, titleBar: 20, body: 21, sectionHeader: 21 },
      margins: { top: 0.5, bottom: 0.5, left: 0.7, right: 0.7 },
      lineSpacing: 1.15,
      bulletStyle: '•',
      sectionSpacingBefore: 12,
      sectionSpacingAfter: 8,
    },
    atsOptimizations: [
      'keyword-density-target: 8-12%',
      'standard-section-headers',
      'no-tables-or-columns',
      'consistent-date-format: MM/YYYY',
      'skill-section-prominent',
    ],
  },
};

const DEFAULT_TEMPLATE = 'techElite';

function getTemplate(key) {
  return ELITE_TEMPLATES[key] || ELITE_TEMPLATES[DEFAULT_TEMPLATE];
}

function selectTemplateByJob(job) {
  if (!job || !job.title) return getTemplate(DEFAULT_TEMPLATE);
  const t = (job.title || '').toLowerCase();
  if (/\b(ceo|cto|cfo|chief|vp|vice president|director|executive)\b/.test(t)) return getTemplate('executive');
  if (/\b(design|creative|marketing|brand|ux|ui)\b/.test(t)) return getTemplate('creative');
  if (/\b(finance|banking|investment|analyst|consulting)\b/.test(t)) return getTemplate('finance');
  if (/\b(engineer|developer|software|technical|product)\b/.test(t)) return getTemplate('techElite');
  return getTemplate('generalProfessional');
}

module.exports = {
  ELITE_TEMPLATES,
  DEFAULT_TEMPLATE,
  getTemplate,
  selectTemplateByJob,
};
