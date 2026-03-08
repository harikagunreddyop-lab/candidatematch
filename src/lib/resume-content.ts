/**
 * Resume Content Generator — Coverage Gate + LLM Rewrite
 *
 * 1. Coverage Gate (deterministic, fast): score candidate against JD requirements
 * 2. LLM Rewrite (only where gaps exist): strengthen weak bullets, add missing keywords
 * 3. Output: structured ResumeContent JSON
 *
 * LLM is NEVER inside the render worker. All expensive ops happen here and are cached.
 */
// ── Types ────────────────────────────────────────────────────────────────────

export interface ResumeContent {
    summary: string;
    experience: ExperienceEntry[];
    skills: SkillCategory[];
    education: EducationEntry[];
    certifications: CertEntry[];
    coverageScore: number;
    gapsFixed: string[];
}

export interface ExperienceEntry {
    company: string;
    title: string;
    dates: string;
    bullets: string[];
}

export interface SkillCategory {
    category: string;
    items: string[];
}

export interface EducationEntry {
    degree: string;
    field: string;
    institution: string;
    date: string;
}

export interface CertEntry {
    name: string;
    issuer: string;
    date: string;
}

interface CoverageReport {
    score: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    weakBulletIndices: number[]; // indices into experience that need rewriting
    summaryNeedsRewrite: boolean;
}

// ── Coverage Gate (deterministic, no LLM) ────────────────────────────────────

/**
 * Score how well the candidate's existing content covers the JD requirements.
 * Returns a 0–100 score + gap analysis.
 */
export function computeCoverage(
    candidate: {
        skills?: string[] | Record<string, unknown>;
        experience?: { company?: string; title?: string; bullets?: string[] }[];
        summary?: string;
    },
    jdRequirements: {
        mustHaveSkills?: string[];
        niceToHaveSkills?: string[];
        keywords?: string[];
    },
): CoverageReport {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]/g, '');

    // Parse candidate skills
    const candidateSkills = new Set(
        (Array.isArray(candidate.skills) ? candidate.skills : Object.keys(candidate.skills || {}))
            .map(normalize),
    );

    // Build full text from bullets + summary for keyword search
    const allBullets = (candidate.experience || []).flatMap((e) => e.bullets || []);
    const fullText = [candidate.summary || '', ...allBullets].join(' ').toLowerCase();

    // Check must-have skills
    const mustHave = (jdRequirements.mustHaveSkills || []).map(normalize);
    const niceToHave = (jdRequirements.niceToHaveSkills || []).map(normalize);
    const allKeywords = Array.from(new Set([...mustHave, ...niceToHave, ...(jdRequirements.keywords || []).map(normalize)]));

    const matched: string[] = [];
    const missing: string[] = [];

    for (const kw of allKeywords) {
        if (candidateSkills.has(kw) || fullText.includes(kw)) {
            matched.push(kw);
        } else {
            missing.push(kw);
        }
    }

    // Check which bullets are weak (< 18 words or no numbers)
    const weakBulletIndices: number[] = [];
    (candidate.experience || []).forEach((exp, i) => {
        const hasBadBullet = (exp.bullets || []).some(
            (b) => b.split(/\s+/).length < 18 || !/\d/.test(b),
        );
        if (hasBadBullet) weakBulletIndices.push(i);
    });

    // Score: 60% keyword match, 20% must-have match, 20% bullet quality
    const keywordScore = allKeywords.length > 0 ? (matched.length / allKeywords.length) * 60 : 60;
    const mustHaveMatched = mustHave.filter((k) => candidateSkills.has(k) || fullText.includes(k));
    const mustHaveScore = mustHave.length > 0 ? (mustHaveMatched.length / mustHave.length) * 20 : 20;
    const bulletScore = weakBulletIndices.length === 0 ? 20 : Math.max(0, 20 - weakBulletIndices.length * 4);
    const totalScore = Math.round(keywordScore + mustHaveScore + bulletScore);

    const summaryNeedsRewrite = !candidate.summary ||
        candidate.summary.length < 100 ||
        missing.some((kw) => !candidate.summary!.toLowerCase().includes(kw));

    return {
        score: totalScore,
        matchedKeywords: matched,
        missingKeywords: missing,
        weakBulletIndices,
        summaryNeedsRewrite,
    };
}

// ── LLM Rewrite (only for gaps) ──────────────────────────────────────────────

/**
 * Rewrites only the weak parts of the resume content using Claude.
 * Skips LLM entirely if coverage is already ≥ 85.
 */
export async function generateContent(
    candidate: {
        full_name: string;
        primary_title?: string;
        skills?: unknown;
        experience?: { company?: string; title?: string; dates?: string; bullets?: string[] }[];
        education?: { degree?: string; field?: string; institution?: string; graduation_date?: string }[];
        certifications?: { name?: string; issuer?: string; date?: string }[];
        summary?: string;
        years_of_experience?: number;
    },
    job: {
        title: string;
        company: string;
        jd_clean?: string;
        jd_raw?: string;
        structured_requirements?: Record<string, unknown>;
        must_have_skills?: string[];
        nice_to_have_skills?: string[];
    },
): Promise<{ content: ResumeContent; coverage: CoverageReport }> {
    const jdText = (job.jd_clean || job.jd_raw || '').slice(0, 5000);
    const requirements = {
        mustHaveSkills: job.must_have_skills || [],
        niceToHaveSkills: job.nice_to_have_skills || [],
        keywords: extractKeywords(jdText),
    };

    // Build initial content from candidate data
    const skills = parseSkillsToCategories(candidate.skills);
    const experience: ExperienceEntry[] = (candidate.experience || []).map((e) => ({
        company: e.company || '',
        title: e.title || '',
        dates: e.dates || '',
        bullets: e.bullets || [],
    }));
    const education: EducationEntry[] = (candidate.education || []).map((e) => ({
        degree: e.degree || '',
        field: e.field || '',
        institution: e.institution || '',
        date: e.graduation_date || '',
    }));
    const certifications: CertEntry[] = (candidate.certifications || []).map((c) => ({
        name: c.name || '',
        issuer: c.issuer || '',
        date: c.date || '',
    }));

    // Run coverage gate
    const coverage = computeCoverage(
        { skills: flattenSkills(skills), experience, summary: candidate.summary },
        requirements,
    );

    // If coverage is already high, skip LLM
    if (coverage.score >= 85 && !coverage.summaryNeedsRewrite && coverage.weakBulletIndices.length === 0) {
        return {
            content: {
                summary: candidate.summary || '',
                experience,
                skills,
                education,
                certifications,
                coverageScore: coverage.score,
                gapsFixed: [],
            },
            coverage,
        };
    }

    // LLM rewrite for gaps only
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) {
        // No API key — return raw content with coverage report
        return {
            content: {
                summary: candidate.summary || '',
                experience,
                skills,
                education,
                certifications,
                coverageScore: coverage.score,
                gapsFixed: [],
            },
            coverage,
        };
    }

    const gapsFixed: string[] = [];
    let rewrittenSummary = candidate.summary || '';
    const rewrittenExperience = [...experience];

    // Build targeted LLM prompt — only rewrite what's needed
    const rewritePrompt = buildRewritePrompt(
        candidate,
        job,
        coverage,
        experience,
    );

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                messages: [{ role: 'user', content: rewritePrompt }],
            }),
        });

        const data = await response.json();
        const text = data.content?.[0]?.text || '{}';
        const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');

        if (parsed.summary && coverage.summaryNeedsRewrite) {
            rewrittenSummary = parsed.summary;
            gapsFixed.push('summary');
        }

        if (parsed.experience && Array.isArray(parsed.experience)) {
            for (const rewrite of parsed.experience) {
                const idx = rewrittenExperience.findIndex(
                    (e) => e.company === rewrite.company || e.title === rewrite.title,
                );
                if (idx >= 0 && rewrite.bullets?.length) {
                    rewrittenExperience[idx] = {
                        ...rewrittenExperience[idx],
                        bullets: rewrite.bullets,
                    };
                    gapsFixed.push(`experience[${idx}]`);
                }
            }
        }
    } catch (err) {
        console.error('[resume-content] LLM rewrite failed:', (err as Error).message);
        // Fall back to original content
    }

    // Re-score after rewrite
    const finalCoverage = computeCoverage(
        { skills: flattenSkills(skills), experience: rewrittenExperience, summary: rewrittenSummary },
        requirements,
    );

    return {
        content: {
            summary: rewrittenSummary,
            experience: rewrittenExperience,
            skills,
            education,
            certifications,
            coverageScore: finalCoverage.score,
            gapsFixed,
        },
        coverage: finalCoverage,
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractKeywords(jdText: string): string[] {
    // Extract significant multi-word and single-word terms from JD
    const words = jdText.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, '').split(/\s+/);
    const stopWords = new Set(['the', 'and', 'or', 'to', 'in', 'of', 'a', 'an', 'is', 'for', 'with', 'on', 'at', 'by', 'as', 'are', 'be', 'we', 'you', 'our', 'this', 'that', 'will', 'from', 'have', 'has', 'not', 'but', 'can', 'all', 'do', 'if', 'it', 'its', 'may', 'no', 'so', 'up', 'out', 'who', 'how', 'than', 'too', 'very', 'able']);
    const freq = new Map<string, number>();
    for (const w of words) {
        if (w.length < 3 || stopWords.has(w)) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
    }
    return Array.from(freq.entries())
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([word]) => word);
}

function parseSkillsToCategories(skills: unknown): SkillCategory[] {
    if (!skills) return [];
    if (Array.isArray(skills)) {
        return [{ category: 'Technical Skills', items: skills.map(String) }];
    }
    if (typeof skills === 'object') {
        return Object.entries(skills as Record<string, unknown>).map(([cat, items]) => ({
            category: cat,
            items: Array.isArray(items) ? items.map(String) : [String(items)],
        }));
    }
    return [];
}

function flattenSkills(categories: SkillCategory[]): string[] {
    return categories.flatMap((c) => c.items);
}

function buildRewritePrompt(
    candidate: { full_name: string; primary_title?: string; years_of_experience?: number },
    job: { title: string; company: string; jd_clean?: string; jd_raw?: string },
    coverage: CoverageReport,
    experience: ExperienceEntry[],
): string {
    const jd = (job.jd_clean || job.jd_raw || '').slice(0, 4000);
    const weakRoles = coverage.weakBulletIndices
        .map((i) => experience[i])
        .filter(Boolean)
        .map((e) => `- ${e.title} at ${e.company}: ${e.bullets.join(' | ')}`);

    return `You are an elite ATS resume writer. Your task is to REWRITE ONLY the weak parts.

CANDIDATE: ${candidate.full_name} (${candidate.primary_title || ''}, ${candidate.years_of_experience || 5} years)

TARGET JOB: ${job.title} at ${job.company}
JD: ${jd}

CURRENT COVERAGE: ${coverage.score}/100
MISSING KEYWORDS: ${coverage.missingKeywords.join(', ')}
${coverage.summaryNeedsRewrite ? 'SUMMARY NEEDS REWRITE: yes' : ''}
WEAK ROLES:
${weakRoles.join('\n')}

INSTRUCTIONS:
1. ${coverage.summaryNeedsRewrite ? 'Rewrite the SUMMARY to include missing keywords naturally (3-6% density).' : 'Do NOT change the summary.'}
2. For each weak role listed above, rewrite bullets using STAR format:
   - Action Verb + Scope + Method + Measurable Outcome
   - 18-32 words per bullet, at least one number
   - Elite verbs: Architected, Engineered, Orchestrated, Automated, Optimized, Accelerated, Reduced, Increased, Implemented, Delivered, Led
   - DO NOT invent facts. Only enhance existing responsibilities.
3. Weave missing keywords (${coverage.missingKeywords.slice(0, 10).join(', ')}) into bullets naturally.

OUTPUT FORMAT (JSON only, no markdown):
{
  ${coverage.summaryNeedsRewrite ? '"summary": "rewritten summary...",' : ''}
  "experience": [
    { "company": "...", "title": "...", "bullets": ["...", "..."] }
  ]
}

Only include roles that were rewritten. Omit roles that don't need changes.`;
}
