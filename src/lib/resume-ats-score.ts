/**
 * Generic ATS-style scoring for a resume (no job description).
 * Scores: formatting, content quality, readability.
 * Used on upload and for "general" ATS check.
 */
import type { ParsedResumeData } from '@/lib/resume-parse';

const MAX_TEXT_LEN = 4000;

export interface GenericAtsBreakdown {
  keywords: { score: number; matched: string[]; missing: string[]; densityNote?: string };
  formatting: { score: number; issues: string[] };
  content: { score: number; suggestions: string[] };
  readability: { score: number; metrics: { wordCount: number; bulletCount: number; sectionCount: number } };
}

export interface GenericAtsResult {
  score: number;
  breakdown: GenericAtsBreakdown;
  recommendations: string[];
}

/** Strong action verbs that improve impact (subset) */
const ACTION_VERBS = new Set([
  'achieved', 'improved', 'increased', 'reduced', 'led', 'managed', 'developed', 'designed',
  'implemented', 'built', 'created', 'launched', 'optimized', 'automated', 'delivered',
  'drove', 'established', 'executed', 'headed', 'initiated', 'negotiated', 'oversaw',
  'pioneered', 'quantified', 'restructured', 'scaled', 'spearheaded', 'transformed',
]);

/** Section headers we expect in an ATS-friendly resume */
const EXPECTED_SECTIONS = ['experience', 'education', 'skills', 'summary', 'work history', 'employment'];

export function calculateGenericAtsScore(
  resumeText: string,
  parsed?: ParsedResumeData | null
): GenericAtsResult {
  const text = (resumeText || '').slice(0, MAX_TEXT_LEN);
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const bulletCount = (text.match(/^[\s]*[•\-\*]\s/gm) || []).length + (text.match(/^\d+\.\s/gm) || []).length;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sectionCount = lines.filter((l) =>
    EXPECTED_SECTIONS.some((s) => l.toLowerCase().includes(s))
  ).length;

  // ── Readability (10 pts): word count, bullets, sections ──
  const readabilityScore = Math.min(
    100,
    (wordCount >= 300 ? 30 : (wordCount / 300) * 30) +
      (bulletCount >= 5 ? 40 : (bulletCount / 5) * 40) +
      (sectionCount >= 2 ? 30 : (sectionCount / 2) * 30)
  );

  // ── Formatting (30 pts) ──
  const formattingIssues: string[] = [];
  if (wordCount < 200) formattingIssues.push('Resume is very short; add more detail.');
  if (bulletCount < 3) formattingIssues.push('Add bullet points to highlight achievements.');
  if (sectionCount < 2) formattingIssues.push('Use clear section headers (e.g. Experience, Education, Skills).');
  if (text.includes('\t')) formattingIssues.push('Avoid tabs; use spaces for consistent formatting.');
  if (text.match(/[^\x00-\x7F]/) && text.length < 500) formattingIssues.push('Non-ASCII characters may not parse well in some ATS systems.');
  const hasContact = /@/.test(text) && (/\d{3}/.test(text) || /linkedin\.com/i.test(text));
  if (!hasContact) formattingIssues.push('Include email and phone or LinkedIn for contact.');
  const formattingScore = Math.max(0, 100 - formattingIssues.length * 18);

  // ── Content quality (20 pts): action verbs, numbers ──
  const suggestions: string[] = [];
  const lowerText = text.toLowerCase();
  const usedVerbs = words.filter((w) => ACTION_VERBS.has(w.toLowerCase()));
  const verbRatio = words.length ? usedVerbs.length / words.length : 0;
  if (verbRatio < 0.01 && wordCount > 100) suggestions.push('Use more strong action verbs (e.g. Led, Achieved, Improved).');
  const hasNumbers = /\d+%|\d+x|\$[\d,]+|\d+\+?\s*(years?|people|clients|projects)/i.test(text);
  if (!hasNumbers && wordCount > 150) suggestions.push('Add quantifiable achievements (percentages, scale, impact).');
  const contentScore = Math.min(
    100,
    (verbRatio * 500) + (hasNumbers ? 50 : 0) + (wordCount >= 300 ? 30 : (wordCount / 300) * 30)
  );

  // ── Keywords / density (40 pts): from parsed skills or heuristic ──
  const skills = parsed?.skills?.length ? parsed.skills : [];
  const uniqueTerms = new Set(lowerText.split(/\W+/).filter((t) => t.length > 2));
  const matched = skills.filter((s) => uniqueTerms.has(s.toLowerCase().replace(/\s+/g, '')));
  const missing: string[] = [];
  let keywordScore = 70; // base
  if (skills.length > 0) {
    const ratio = matched.length / Math.max(1, skills.length);
    keywordScore = Math.round(ratio * 60) + (uniqueTerms.size > 50 ? 20 : uniqueTerms.size > 20 ? 10 : 0);
    if (ratio < 0.5) missing.push(...skills.slice(0, 5).filter((s) => !matched.includes(s)));
  } else {
    if (uniqueTerms.size < 30) {
      keywordScore = 50;
      suggestions.push('Add a Skills or Technologies section with relevant keywords.');
    }
  }
  keywordScore = Math.min(100, keywordScore);

  // Total: 40 + 30 + 20 + 10
  const total = Math.round(
    (keywordScore * 0.4) + (formattingScore * 0.3) + (Math.min(100, contentScore) * 0.2) + (readabilityScore * 0.1)
  );
  const recommendations = [...formattingIssues, ...suggestions].slice(0, 8);

  return {
    score: Math.min(100, Math.max(0, total)),
    breakdown: {
      keywords: {
        score: keywordScore,
        matched: matched.slice(0, 20),
        missing: missing.slice(0, 10),
        densityNote: uniqueTerms.size > 50 ? 'Good keyword variety' : undefined,
      },
      formatting: { score: formattingScore, issues: formattingIssues },
      content: { score: Math.min(100, contentScore), suggestions },
      readability: {
        score: Math.round(readabilityScore),
        metrics: { wordCount, bulletCount, sectionCount },
      },
    },
    recommendations,
  };
}
