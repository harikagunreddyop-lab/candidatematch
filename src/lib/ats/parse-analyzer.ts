/**
 * Parse Integrity Analyzer — deterministic
 *
 * Failure modes documented in research:
 * - Taleo: CANNOT process tables, multi-column layouts, graphics, header/footer content
 * - Workday: OCR autofill produces errors from complex layouts (34% error rate documented)
 * - iCIMS: Reading order breaks with columns (right column gets merged with left mid-sentence)
 * - Lever: Recommends DOCX; PDF tables disrupt parsing
 * - All systems: contact info in header/footer = invisible to parser
 * - All systems: non-standard section names = data not attributed to correct candidate field
 *
 * Standard section headers recognized across all 6 major ATS (research confirmed):
 *   WORK EXPERIENCE / PROFESSIONAL EXPERIENCE / EXPERIENCE
 *   EDUCATION / ACADEMIC BACKGROUND
 *   SKILLS / TECHNICAL SKILLS / CORE COMPETENCIES
 *   SUMMARY / PROFESSIONAL SUMMARY / OBJECTIVE / PROFILE
 *   CERTIFICATIONS / LICENSES
 */

import type { ParseIntegrityResult } from './types';

const REQUIRED_SECTIONS = ['experience', 'education', 'skills'];

const SECTION_PATTERNS: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: 'experience',
    patterns: [
      /^(work\s+)?experience$/i,
      /^professional\s+experience$/i,
      /^employment(\s+history)?$/i,
      /^career\s+history$/i,
      /^work\s+history$/i,
    ],
  },
  {
    name: 'education',
    patterns: [
      /^education(al\s+background)?$/i,
      /^academic(\s+background)?$/i,
      /^degrees?$/i,
    ],
  },
  {
    name: 'skills',
    patterns: [
      /^(technical\s+)?skills?$/i,
      /^core\s+competenc(ies|y)$/i,
      /^technologies$/i,
      /^tech(nical)?\s+stack$/i,
      /^expertise$/i,
    ],
  },
  {
    name: 'summary',
    patterns: [
      /^(professional\s+)?summary$/i,
      /^objective$/i,
      /^profile$/i,
      /^about(\s+me)?$/i,
      /^executive\s+summary$/i,
    ],
  },
  {
    name: 'certifications',
    patterns: [
      /^certifications?$/i,
      /^licenses?\s+(&|and)\s+certifications?$/i,
      /^credentials?$/i,
    ],
  },
];

// Table detection heuristics (text-parsed resume)
const TABLE_SIGNALS = [
  /\|\s*\w+\s*\|/,                    // pipe-delimited
  /\+[-+]+\+/,                         // ASCII table borders
  /\t.{5,}\t.{5,}/,                   // multiple tab-separated columns
];

// Column detection heuristics
const COLUMN_SIGNALS = [
  // Two short lines side by side (≤40 chars each) with large space gap
  /^.{5,40}\s{10,}.{5,40}$/m,
];

// Header/footer indicators
const HEADER_FOOTER_SIGNALS = [
  /page \d+ of \d+/i,
  /confidential/i,
  /curriculum vitae/i,
];

export function analyzeParseIntegrity(resumeText: string): ParseIntegrityResult {
  const lines = resumeText.split('\n');
  const warnings: string[] = [];

  // 1. Contact in body (not header/footer)
  const hasEmail = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(resumeText);
  const hasPhone = /(\+?1?\s*[-.]?\s*)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i.test(resumeText);
  const has_contact_in_body = hasEmail && hasPhone;
  if (!hasEmail) warnings.push('No email address detected in resume body');
  if (!hasPhone) warnings.push('No phone number detected in resume body');

  // 2. Standard section headers
  const foundSections = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.length > 80) continue;
    for (const { name, patterns } of SECTION_PATTERNS) {
      if (patterns.some(p => p.test(trimmed))) {
        foundSections.add(name);
      }
    }
  }

  const parseable_sections = Array.from(foundSections);
  const missing_sections = REQUIRED_SECTIONS.filter(s => !foundSections.has(s));
  const has_standard_headers = missing_sections.length === 0;
  if (!has_standard_headers) {
    warnings.push(`Missing standard sections: ${missing_sections.join(', ')}. All ATS require these exact headers.`);
  }

  // 3. Date format consistency
  const datePatterns = {
    mmYYYY: (resumeText.match(/\b(0?[1-9]|1[0-2])\/20\d{2}\b/g) ?? []).length,
    monthYear: (resumeText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/g) ?? []).length,
    YYYY: (resumeText.match(/\b20\d{2}\s*[-–]\s*20\d{2}\b/g) ?? []).length,
    abbrevMonth: (resumeText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2}\b/g) ?? []).length,
  };
  const formatCounts = Object.values(datePatterns).filter(c => c > 0).length;
  const date_format_consistent = formatCounts <= 1;
  if (!date_format_consistent) {
    warnings.push('Mixed date formats detected. Use MM/YYYY consistently — Taleo and iCIMS are strict about date format.');
  }

  // 4. Table detection
  const tableDetected = TABLE_SIGNALS.some(re => re.test(resumeText));
  const no_tables_detected = !tableDetected;
  if (tableDetected) {
    warnings.push('Table structure detected. Taleo CANNOT parse tables — content inside will be lost or garbled.');
  }

  // 5. Column detection
  const columnDetected = COLUMN_SIGNALS.some(re => re.test(resumeText));
  const no_columns_detected = !columnDetected;
  if (columnDetected) {
    warnings.push('Multi-column layout detected. Use single-column — Taleo and iCIMS break on multi-column layouts.');
  }

  // 6. Header/footer content
  const headerFooterDetected = HEADER_FOOTER_SIGNALS.some(re => re.test(resumeText));
  const no_header_footer_content = !headerFooterDetected;
  if (headerFooterDetected) {
    warnings.push('Content appears in header/footer. Older ATS (Taleo, iCIMS) cannot read header/footer content.');
  }

  // Score calculation
  let score = 100;
  if (!has_contact_in_body) score -= 25;
  if (!has_standard_headers) score -= (missing_sections.length * 12);
  if (!date_format_consistent) score -= 10;
  if (!no_tables_detected) score -= 30;  // Taleo fatal
  if (!no_columns_detected) score -= 20;
  if (!no_header_footer_content) score -= 10;

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    has_contact_in_body,
    has_standard_headers,
    date_format_consistent,
    no_tables_detected,
    no_columns_detected,
    no_header_footer_content,
    has_email: hasEmail,
    has_phone: hasPhone,
    parseable_sections,
    missing_sections,
    warnings,
  };
}

