import {
  CanonicalExperience,
  CanonicalResumeProfile,
  CanonicalSkillEvidence,
} from './types';
import { normalize, hasMetrics, hasOwnershipLanguage, containsWholeWord } from './utils/text';
import {
  parseResumeSections,
  extractBullets,
  getSectionText,
  ResumeSection,
} from './utils/sections';
import {
  parseDate,
  monthsBetween,
  getRecencyBand,
  detectDateFormats,
} from './utils/dates';
import { gradeEvidence, computeEffectiveCredit } from './utils/evidence';
import { getSynonyms } from './synonyms';
import { ENGINEERING_SYNONYMS } from './synonyms/engineering';
import { DATA_SYNONYMS } from './synonyms/data';
import { classifyRoleFamily } from './role-family-classifier';
import { RECENCY_MULTIPLIERS } from './types';

type StructuredExperience = {
  title: string;
  company: string;
  start_date: string | null;
  end_date: string | null;
  current: boolean;
  bullets: string[];
};

type StructuredEducation = {
  degree: string | null;
  field: string | null;
  institution: string | null;
  graduation_year: number | null;
};

type StructuredData = {
  skills?: string[];
  tools?: string[];
  experience?: StructuredExperience[];
  education?: StructuredEducation[];
  certifications?: string[];
  primary_title?: string;
  secondary_titles?: string[];
  years_of_experience?: number;
};

function parseEmail(text: string): boolean {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  return emailRegex.test(text);
}

function parsePhone(text: string): boolean {
  const phoneRegex =
    /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4})/;
  return phoneRegex.test(text);
}

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
    // Look for two blocks of non-space text separated by 10+ spaces
    return /\S {10,}\S/.test(line);
  });
}

function buildExperienceFromStructured(
  structured: StructuredExperience[],
): CanonicalExperience[] {
  const experiences: CanonicalExperience[] = [];

  for (const item of structured) {
    const start = item.start_date ? parseDate(item.start_date) : null;
    const end =
      item.current || !item.end_date
        ? new Date()
        : parseDate(item.end_date);

    let duration_months = 0;
    if (start && end) {
      duration_months = monthsBetween(start, end);
    }

    const bullets = item.bullets || [];
    const skills_mentioned = deriveSkillsMentioned(bullets);

    experiences.push({
      title: item.title ?? '',
      company: item.company ?? '',
      start_date: item.start_date,
      end_date: item.end_date,
      is_current: !!item.current,
      duration_months,
      bullets,
      skills_mentioned,
      has_metrics: bullets.some((b) => hasMetrics(b)),
      has_ownership_language: bullets.some((b) => hasOwnershipLanguage(b)),
    });
  }

  return experiences;
}

function deriveSkillsMentioned(bullets: string[]): string[] {
  const keys = [
    ...Object.keys(ENGINEERING_SYNONYMS),
    ...Object.keys(DATA_SYNONYMS),
  ];
  const mentioned = new Set<string>();

  for (const bullet of bullets) {
    const normBullet = normalize(bullet);
    for (const key of keys) {
      const normKey = normalize(key);
      if (normKey && normBullet.includes(normKey)) {
        mentioned.add(key);
      }
    }
  }

  return Array.from(mentioned);
}

function buildExperienceFromSections(
  sections: ResumeSection[],
): CanonicalExperience[] {
  const experienceText = getSectionText(sections, 'experience');
  if (!experienceText.trim()) return [];

  const lines = experienceText.split(/\r?\n/);
  const blocks: string[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (currentBlock.length) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length) {
    blocks.push(currentBlock.join('\n'));
  }

  const experiences: CanonicalExperience[] = [];

  for (const block of blocks) {
    const blockLines = block.split(/\r?\n/);
    const titleCompanyLine = blockLines[0] ?? '';
    const bullets = extractBullets(block);

    const skills_mentioned = deriveSkillsMentioned(bullets);

    experiences.push({
      title: titleCompanyLine.trim(),
      company: '',
      start_date: null,
      end_date: null,
      is_current: false,
      duration_months: 0,
      bullets,
      skills_mentioned,
      has_metrics: bullets.some((b) => hasMetrics(b)),
      has_ownership_language: bullets.some((b) => hasOwnershipLanguage(b)),
    });
  }

  return experiences;
}

function computeTotalYearsExperience(
  experiences: CanonicalExperience[],
  fallbackYears?: number,
): number {
  if (typeof fallbackYears === 'number') {
    return fallbackYears;
  }

  type Interval = { start: Date; end: Date };
  const intervals: Interval[] = [];

  for (const exp of experiences) {
    const start = exp.start_date ? parseDate(exp.start_date) : null;
    const end = exp.end_date
      ? parseDate(exp.end_date)
      : exp.is_current
      ? new Date()
      : null;
    if (start && end) {
      intervals.push({ start, end });
    }
  }

  if (!intervals.length) {
    const months = experiences.reduce(
      (sum, e) => sum + (e.duration_months || 0),
      0,
    );
    return +(months / 12).toFixed(1);
  }

  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Interval[] = [];
  let current = intervals[0];

  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    if (next.start <= current.end) {
      if (next.end > current.end) current.end = next.end;
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  const totalMonths = merged.reduce(
    (sum, iv) => sum + monthsBetween(iv.start, iv.end),
    0,
  );

  return +(totalMonths / 12).toFixed(1);
}

function buildSkillEvidenceMap(
  resumeText: string,
  experiences: CanonicalExperience[],
  skills: string[],
): Map<string, CanonicalSkillEvidence> {
  const skillEvidence = new Map<string, CanonicalSkillEvidence>();
  if (!skills.length) return skillEvidence;

  const currentYear = new Date().getFullYear();
  const normalizedResume = normalize(resumeText);

  for (const rawSkill of skills) {
    const canonical = rawSkill.trim();
    if (!canonical) continue;

    const normalizedSkill = normalize(canonical);
    if (!normalizedSkill) continue;

    const synonyms = getSynonyms(normalizedSkill);
    const uniqueSynonyms = Array.from(
      new Set(
        synonyms
          .map((s) => normalize(s))
          .filter((s) => s && s !== normalizedSkill),
      ),
    );

    let exact_count = 0;
    let synonym_count = 0;

    const countOccurrencesSimple = (text: string, term: string): number => {
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      return matches ? matches.length : 0;
    };

    exact_count = countOccurrencesSimple(normalizedResume, normalizedSkill);
    for (const syn of uniqueSynonyms) {
      synonym_count += countOccurrencesSimple(normalizedResume, syn);
    }

    let in_experience_bullets = false;
    let in_multiple_jobs = false;
    let has_ownership_signal = false;
    let has_metric = false;

    let jobsWithSkill = 0;
    const jobsWithSkillSet = new Set<number>();

    const mentionsInBullet = (bullet: string): boolean => {
      if (containsWholeWord(bullet, rawSkill)) return true;
      for (const syn of synonyms) {
        if (containsWholeWord(bullet, syn)) return true;
      }
      return false;
    };

    experiences.forEach((exp, idx) => {
      const bullets = exp.bullets || [];
      let jobHasSkill = false;

      for (const b of bullets) {
        if (mentionsInBullet(b)) {
          in_experience_bullets = true;
          jobHasSkill = true;
          if (hasOwnershipLanguage(b)) has_ownership_signal = true;
          if (hasMetrics(b)) has_metric = true;
        }
      }

      if (jobHasSkill) {
        jobsWithSkill++;
        jobsWithSkillSet.add(idx);
      }
    });

    in_multiple_jobs = jobsWithSkillSet.size > 1;

    let last_used_year: number | null = null;
    experiences.forEach((exp) => {
      const bullets = exp.bullets || [];
      const expMentions = bullets.some((b) => mentionsInBullet(b));
      if (!expMentions) return;

      let year: number | null = null;

      if (exp.end_date) {
        const end = parseDate(exp.end_date);
        if (end) year = end.getFullYear();
      } else if (exp.is_current && exp.start_date) {
        year = currentYear;
      }

      if (year !== null) {
        if (last_used_year === null || year > last_used_year) {
          last_used_year = year;
        }
      }
    });

    const recencyBand = getRecencyBand(last_used_year, currentYear);
    const recency_multiplier = RECENCY_MULTIPLIERS[recencyBand];

    const grade = gradeEvidence({
      exact_count,
      synonym_count,
      in_experience_bullets,
      in_skills_section: true,
      in_multiple_jobs,
      has_ownership_signal,
      has_metric,
    });

    const effective_credit = computeEffectiveCredit(
      grade,
      recency_multiplier,
    );

    const evidence: CanonicalSkillEvidence = {
      term: canonical,
      normalized: normalizedSkill,
      grade,
      grade_value: effective_credit / recency_multiplier || 0,
      recency: recencyBand,
      recency_multiplier,
      effective_credit,
      source_snippets: [], // can be populated later with snippet extraction
      last_used_year,
    };

    skillEvidence.set(canonical, evidence);
  }

  return skillEvidence;
}

function computeParseQuality(
  sections: ResumeSection[],
  resumeText: string,
): { score: number; warnings: string[] } {
  let score = 100;
  const warnings: string[] = [];

  const experienceText = getSectionText(sections, 'experience');
  const skillsText = getSectionText(sections, 'skills');
  const educationText = getSectionText(sections, 'education');

  if (!experienceText.trim()) {
    score -= 20;
    warnings.push('Experience section not found.');
  }
  if (!skillsText.trim()) {
    score -= 15;
    warnings.push('Skills section not found.');
  }
  if (!educationText.trim()) {
    score -= 10;
    warnings.push('Education section not found.');
  }

  if (!parseEmail(resumeText)) {
    score -= 10;
    warnings.push('Email address not detected.');
  }
  if (!parsePhone(resumeText)) {
    score -= 10;
    warnings.push('Phone number not detected.');
  }

  const formats = detectDateFormats(resumeText);
  const uniqueFormats = new Set(formats);
  if (uniqueFormats.size > 1) {
    const extra = uniqueFormats.size - 1;
    score -= extra * 5;
    warnings.push('Multiple date formats detected.');
  }

  if (detectTableStructure(resumeText)) {
    score -= 20;
    warnings.push('Table-like layout detected.');
  }

  if (detectMultiColumnLayout(resumeText)) {
    score -= 15;
    warnings.push('Possible multi-column layout detected.');
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return { score, warnings };
}

export async function normalizeCandidate(
  candidateId: string,
  resumeId: string,
  resumeText: string,
  structuredData?: StructuredData,
): Promise<CanonicalResumeProfile> {
  const sections = parseResumeSections(resumeText);

  const experiences: CanonicalExperience[] =
    structuredData?.experience && structuredData.experience.length
      ? buildExperienceFromStructured(structuredData.experience)
      : buildExperienceFromSections(sections);

  const total_years_experience = computeTotalYearsExperience(
    experiences,
    structuredData?.years_of_experience,
  );

  const skillList = [
    ...(structuredData?.skills ?? []),
    ...(structuredData?.tools ?? []),
  ];

  const skill_evidence = buildSkillEvidenceMap(
    resumeText,
    experiences,
    skillList,
  );

  const titles: string[] = [];
  if (structuredData?.primary_title) titles.push(structuredData.primary_title);
  if (structuredData?.secondary_titles) {
    titles.push(...structuredData.secondary_titles.filter(Boolean));
  }

  const roleClassification = classifyRoleFamily(titles, resumeText);

  const { score: parse_quality, warnings: parse_warnings } =
    computeParseQuality(sections, resumeText);

  const education =
    structuredData?.education?.map((e) => ({
      degree: e.degree,
      field: e.field,
      institution: e.institution,
      graduation_year: e.graduation_year,
      is_relevant: true,
    })) ?? [];

  const profile: CanonicalResumeProfile = {
    candidate_id: candidateId,
    resume_id: resumeId,
    // Classification
    inferred_family: roleClassification.family,
    family_confidence: roleClassification.confidence,
    inferred_seniority: null,
    // Totals
    total_years_experience,
    total_roles: experiences.length,
    // Evidence map
    skill_evidence,
    // Structured sections
    experience: experiences,
    education,
    certifications: structuredData?.certifications ?? [],
    // Parse quality
    parse_quality,
    parse_warnings,
    // Raw text
    resume_text: resumeText,
  };

  return profile;
}


