/**
 * Inclusive language checker for job descriptions.
 * Rule-based detection + optional AI analysis.
 */

const MALE_CODED = [
  'rockstar', 'ninja', 'aggressive', 'dominant', 'competitive', 'driven', 'assertive',
  'ambitious', 'fearless', 'guru', 'maverick', 'warrior', 'king', 'bro', 'dude',
];
const FEMALE_CODED = [
  'support', 'nurture', 'collaborative', 'interpersonal', 'empathy', 'cooperative',
  'devoted', 'sensitive', 'caring', 'help', 'assist', 'loyal',
];
const AGE_BIAS = [
  'digital native', 'recent graduate', 'energetic', 'mature', 'young', 'dynamic',
  'fresh', 'seasoned', 'veteran', 'old school', 'millennial', 'gen z',
];
const ABLEIST = [
  'crazy', 'insane', 'blind to', 'tone-deaf', 'lame', 'cripple', 'handicapped',
  'normal', 'healthy', 'sanity check', 'walk-in', 'stand-up',
];

export interface InclusiveLanguageResult {
  gender_bias: { male_coded: string[]; female_coded: string[] };
  age_bias: string[];
  ableist: string[];
  overall_score: number;
  suggestions: { term: string; suggestion: string; category: string }[];
}

export function checkInclusiveLanguage(jobDescription: string): InclusiveLanguageResult {
  const lower = jobDescription.toLowerCase();
  const male_coded = MALE_CODED.filter((word) => lower.includes(word));
  const female_coded = FEMALE_CODED.filter((word) => lower.includes(word));
  const age_bias = AGE_BIAS.filter((term) => lower.includes(term));
  const ableist = ABLEIST.filter((term) => lower.includes(term));

  const suggestions: { term: string; suggestion: string; category: string }[] = [];
  const replace: Record<string, string> = {
    rockstar: 'top performer / expert',
    ninja: 'expert / specialist',
    aggressive: 'results-driven / proactive',
    dominant: 'leading',
    guru: 'expert',
    maverick: 'independent contributor',
    warrior: 'dedicated team member',
    'digital native': 'comfortable with technology',
    'recent graduate': 'early-career',
    energetic: 'engaged',
    mature: 'experienced',
    crazy: 'exceptional / very',
    insane: 'exceptional',
    lame: 'disappointing',
    'sanity check': 'quick review',
  };
  for (const t of [...male_coded, ...age_bias, ...ableist]) {
    const suggestion = replace[t];
    if (suggestion) suggestions.push({ term: t, suggestion, category: 'replace' });
  }

  const issueCount = male_coded.length + female_coded.length + age_bias.length + ableist.length;
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const density = wordCount > 0 ? issueCount / wordCount : 0;
  const overall_score = Math.max(0, Math.min(100, Math.round(100 - density * 500 - issueCount * 5)));

  return {
    gender_bias: { male_coded, female_coded },
    age_bias,
    ableist,
    overall_score,
    suggestions,
  };
}
