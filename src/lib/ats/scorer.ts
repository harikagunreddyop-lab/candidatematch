/**
 * Enhanced ATS scoring with multi-factor analysis and real-time optimization.
 * Uses Claude for detailed feedback (formatting, keywords, experience, skills, education, achievements).
 */

import { callClaude, CLAUDE_MODEL } from '@/lib/ai/anthropic';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ATSScores {
  formatting: number;
  keyword_match: number;
  experience: number;
  skills: number;
  education: number;
  achievements: number;
}

export interface ATSKeywords {
  found: string[];
  missing: string[];
  density: number;
}

export interface ATSFlags {
  has_tables: boolean;
  has_images: boolean;
  has_columns: boolean;
  uses_standard_fonts: boolean;
  parseable_dates: boolean;
}

export interface ATSScore {
  overall_score: number;
  ats_pass_probability: number;
  scores: ATSScores;
  keywords: ATSKeywords;
  improvements: string[];
  strengths: string[];
  ats_flags: ATSFlags;
}

export interface OptimizeResult {
  /** When score already >= 90, no changes */
  resume?: string;
  /** When optimized version was generated */
  original?: string;
  optimized?: string;
  score: ATSScore;
  changes: string[];
}

const DEFAULT_SCORE: ATSScore = {
  overall_score: 0,
  ats_pass_probability: 0,
  scores: {
    formatting: 0,
    keyword_match: 0,
    experience: 0,
    skills: 0,
    education: 0,
    achievements: 0,
  },
  keywords: { found: [], missing: [], density: 0 },
  improvements: [],
  strengths: [],
  ats_flags: {
    has_tables: false,
    has_images: false,
    has_columns: false,
    uses_standard_fonts: true,
    parseable_dates: true,
  },
};

function buildScorePrompt(resumeText: string, jobDescription: string): string {
  const resumeSnippet = resumeText.slice(0, 12000).replace(/```/g, '`');
  const jdSnippet = jobDescription.slice(0, 8000).replace(/```/g, '`');
  return `Analyze this resume for ATS compatibility and job match.

RESUME:
${resumeSnippet}

JOB DESCRIPTION:
${jdSnippet}

Score on these factors (0-100 each):
1. Formatting (parseable, clean structure)
2. Keyword Match (% of required keywords present)
3. Experience Relevance (years and role alignment)
4. Skills Match (technical and soft skills)
5. Education Requirements
6. Achievement Quantification (has metrics)

Return valid JSON only, no markdown or extra text, with this exact structure:
{
  "overall_score": 87,
  "ats_pass_probability": 0.92,
  "scores": {
    "formatting": 95,
    "keyword_match": 85,
    "experience": 90,
    "skills": 80,
    "education": 85,
    "achievements": 75
  },
  "keywords": {
    "found": ["Python", "React", "AWS", "Team Leadership"],
    "missing": ["Kubernetes", "CI/CD"],
    "density": 0.08
  },
  "improvements": [
    "Add 'Kubernetes' keyword in skills section",
    "Quantify achievement in current role (e.g., 'Improved performance by X%')",
    "Include years of experience with each technology"
  ],
  "strengths": [
    "Strong keyword density (8%)",
    "Clear section headers",
    "Quantified achievements",
    "Relevant experience level"
  ],
  "ats_flags": {
    "has_tables": false,
    "has_images": false,
    "has_columns": false,
    "uses_standard_fonts": true,
    "parseable_dates": true
  }
}`;
}

function parseScoreResponse(text: string): ATSScore {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in ATS score response');
  const parsed = JSON.parse(jsonMatch[0]) as Partial<ATSScore>;
  return {
    overall_score: Math.max(0, Math.min(100, Number(parsed.overall_score) || 0)),
    ats_pass_probability: Math.max(0, Math.min(1, Number(parsed.ats_pass_probability) || 0)),
    scores: {
      formatting: Math.max(0, Math.min(100, Number(parsed.scores?.formatting) ?? 0)),
      keyword_match: Math.max(0, Math.min(100, Number(parsed.scores?.keyword_match) ?? 0)),
      experience: Math.max(0, Math.min(100, Number(parsed.scores?.experience) ?? 0)),
      skills: Math.max(0, Math.min(100, Number(parsed.scores?.skills) ?? 0)),
      education: Math.max(0, Math.min(100, Number(parsed.scores?.education) ?? 0)),
      achievements: Math.max(0, Math.min(100, Number(parsed.scores?.achievements) ?? 0)),
    },
    keywords: {
      found: Array.isArray(parsed.keywords?.found) ? parsed.keywords.found.map(String) : [],
      missing: Array.isArray(parsed.keywords?.missing) ? parsed.keywords.missing.map(String) : [],
      density: Math.max(0, Math.min(1, Number(parsed.keywords?.density) ?? 0)),
    },
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map(String) : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    ats_flags: {
      has_tables: Boolean(parsed.ats_flags?.has_tables),
      has_images: Boolean(parsed.ats_flags?.has_images),
      has_columns: Boolean(parsed.ats_flags?.has_columns),
      uses_standard_fonts: parsed.ats_flags?.uses_standard_fonts !== false,
      parseable_dates: parsed.ats_flags?.parseable_dates !== false,
    },
  };
}

// ── Scorer ────────────────────────────────────────────────────────────────────

export class ATSScorer {
  async scoreResume(resumeText: string, jobDescription: string): Promise<ATSScore> {
    if (!resumeText?.trim() || !jobDescription?.trim()) {
      return { ...DEFAULT_SCORE };
    }
    const prompt = buildScorePrompt(resumeText, jobDescription);
    const response = await callClaude(prompt, {
      model: CLAUDE_MODEL,
      maxTokens: 1500,
    });
    return parseScoreResponse(response);
  }

  async optimizeResume(resumeText: string, jobDescription: string): Promise<OptimizeResult> {
    const score = await this.scoreResume(resumeText, jobDescription);

    if (score.overall_score >= 90) {
      return { resume: resumeText, score, changes: [] };
    }

    const optimized = await this.generateOptimizations(resumeText, jobDescription, score);
    return {
      original: resumeText,
      optimized: optimized.resume,
      score: optimized.newScore,
      changes: optimized.changes,
    };
  }

  private async generateOptimizations(
    resumeText: string,
    jobDescription: string,
    currentScore: ATSScore
  ): Promise< { resume: string; newScore: ATSScore; changes: string[] }> {
    const resumeSnippet = resumeText.slice(0, 10000).replace(/```/g, '`');
    const jdSnippet = jobDescription.slice(0, 6000).replace(/```/g, '`');
    const improvementsList = currentScore.improvements.slice(0, 6).join('\n- ');
    const missingKw = currentScore.keywords.missing.slice(0, 10).join(', ');

    const prompt = `You are an ATS resume optimizer. Improve the resume so it scores higher for this job.

JOB DESCRIPTION:
${jdSnippet}

CURRENT RESUME:
${resumeSnippet}

IMPROVEMENTS TO APPLY:
- ${improvementsList}
${missingKw ? `\nAdd these keywords naturally where relevant: ${missingKw}` : ''}

Rules:
- Output the FULL improved resume as plain text (no JSON, no code block).
- Keep the same structure and length roughly; only add/fix content.
- Add missing keywords in skills and bullet points where they fit.
- Quantify achievements where you can (%, numbers, time saved).
- Do not invent experience; only rephrase or add metrics to existing content.
- Start directly with the resume text (e.g. candidate name or "SUMMARY").`;

    const response = await callClaude(prompt, {
      model: CLAUDE_MODEL,
      maxTokens: 4000,
    });

    const optimizedText = response
      .replace(/^```[\w]*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    const finalResume = optimizedText || resumeText;

    const newScore = await this.scoreResume(finalResume, jobDescription);
    const changes = currentScore.improvements.slice(0, 5).map((s, i) => `${i + 1}. ${s}`);
    return { resume: finalResume, newScore, changes };
  }
}
