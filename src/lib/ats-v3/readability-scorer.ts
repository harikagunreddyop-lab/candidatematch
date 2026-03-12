import { ReadabilityBreakdown } from './types';
import { detectDateFormats } from './utils/dates';
import { parseResumeSections, getSectionText } from './utils/sections';

function clip(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

const EMAIL_REGEX = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const PHONE_REGEX =
  /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

function detectTableStructure(text: string): boolean {
  const lines = text.split(/\r?\n/);
  return lines.some(
    (line) =>
      /\|.*\|/.test(line) || /\+\-[-+]+\+/.test(line),
  );
}

function detectMultiColumnLayout(text: string): boolean {
  const lines = text.split(/\r?\n/);
  return lines.some((line) => {
    if (line.length > 40) return false;
    return /\S {10,}\S/.test(line);
  });
}

export function scoreReadability(
  resumeText: string,
  parseQuality: number,
): ReadabilityBreakdown {
  const sections = parseResumeSections(resumeText);

  // 1. PARSE_INTEGRITY
  const parse_integrity = clip(parseQuality, 0, 100);

  // 2. SECTION_COMPLETENESS
  const experienceText = getSectionText(sections, 'experience');
  const educationText = getSectionText(sections, 'education');
  const skillsText = getSectionText(sections, 'skills');
  const summaryText = getSectionText(sections, 'summary');
  const certsText = getSectionText(sections, 'certifications');

  let section_completeness = 0;
  const missing_sections: string[] = [];

  if (experienceText.trim()) {
    section_completeness += 30;
  } else {
    missing_sections.push('experience');
  }

  if (educationText.trim()) {
    section_completeness += 25;
  } else {
    missing_sections.push('education');
  }

  if (skillsText.trim()) {
    section_completeness += 25;
  } else {
    missing_sections.push('skills');
  }

  if (summaryText.trim()) {
    section_completeness += 10;
  } else {
    missing_sections.push('summary');
  }

  if (certsText.trim()) {
    section_completeness += 10;
  } else {
    missing_sections.push('certifications');
  }

  // 3. CONTACT_VISIBILITY
  const hasEmail = EMAIL_REGEX.test(resumeText);
  const hasPhone = PHONE_REGEX.test(resumeText);
  const contact_visibility = (hasEmail ? 50 : 0) + (hasPhone ? 50 : 0);

  // 4. DATE_CONSISTENCY
  const formats = detectDateFormats(resumeText);
  let date_consistency = 0;
  if (formats.length === 0) {
    date_consistency = 30;
  } else if (formats.length === 1) {
    date_consistency = 100;
  } else if (formats.length === 2) {
    date_consistency = 65;
  } else {
    date_consistency = 35;
  }

  // 5. LAYOUT_SAFETY
  let layout_safety_base = 100;
  const table_detected = detectTableStructure(resumeText);
  const columns_detected = detectMultiColumnLayout(resumeText);

  if (table_detected) layout_safety_base -= 30;
  if (columns_detected) layout_safety_base -= 20;

  const len = resumeText.length;
  const first100 = resumeText.slice(0, 100);
  const last100 = resumeText.slice(Math.max(0, len - 100));

  const emailMatches = resumeText.match(EMAIL_REGEX);
  const phoneMatches = resumeText.match(PHONE_REGEX);

  const has_email_in_body =
    !!emailMatches &&
    (resumeText.search(EMAIL_REGEX) >= 100 &&
      resumeText.search(EMAIL_REGEX) < len - 100);
  const has_phone_in_body =
    !!phoneMatches &&
    (resumeText.search(PHONE_REGEX) >= 100 &&
      resumeText.search(PHONE_REGEX) < len - 100);

  const emailInFirstOrLast =
    EMAIL_REGEX.test(first100) || EMAIL_REGEX.test(last100);
  const phoneInFirstOrLast =
    PHONE_REGEX.test(first100) || PHONE_REGEX.test(last100);

  const header_footer_only_contact =
    (emailInFirstOrLast || phoneInFirstOrLast) &&
    !has_email_in_body &&
    !has_phone_in_body;

  if (header_footer_only_contact) {
    layout_safety_base -= 15;
  }

  const layout_safety = clip(layout_safety_base, 0, 100);

  // READABILITY SCORE
  const readability_score = Math.round(
    0.25 * parse_integrity +
      0.25 * section_completeness +
      0.2 * contact_visibility +
      0.15 * date_consistency +
      0.15 * layout_safety,
  );

  let readability_band: ReadabilityBreakdown['readability_band'];
  if (readability_score >= 75) {
    readability_band = 'safe';
  } else if (readability_score >= 50) {
    readability_band = 'moderate-risk';
  } else {
    readability_band = 'high-risk';
  }

  const warnings: string[] = [];
  if (parse_integrity < 50) {
    warnings.push('Low parse integrity — ATS may struggle to read this resume.');
  }
  if (!hasEmail) {
    warnings.push('Email address not clearly visible.');
  }
  if (!hasPhone) {
    warnings.push('Phone number not clearly visible.');
  }
  if (formats.length === 0) {
    warnings.push('No dates detected — work history may be unclear.');
  } else if (formats.length >= 3) {
    warnings.push('Multiple inconsistent date formats detected.');
  }
  if (table_detected) {
    warnings.push('Table formatting detected — may not parse well in ATS.');
  }
  if (columns_detected) {
    warnings.push('Multi-column layout detected — risk for ATS parsing.');
  }
  if (header_footer_only_contact) {
    warnings.push(
      'Contact details appear only in header/footer — some parsers may miss them.',
    );
  }

  return {
    readability_score,
    readability_band,
    parse_integrity,
    section_completeness,
    contact_visibility,
    date_consistency,
    layout_safety,
    has_email_in_body,
    has_phone_in_body,
    has_experience_section: !!experienceText.trim(),
    has_education_section: !!educationText.trim(),
    has_skills_section: !!skillsText.trim(),
    has_summary_section: !!summaryText.trim(),
    date_formats_detected: formats.length,
    table_detected,
    columns_detected,
    header_footer_only_contact,
    missing_sections,
    warnings,
  };
}


