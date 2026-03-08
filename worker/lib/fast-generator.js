/**
 * Ultra-fast resume generation pipeline: cache, parallel prep, elite templates.
 * Target: sub-2s when cached; first-time generation dominated by LLM.
 */

const crypto = require('crypto');
const { toAtsCandidate } = require('../ats-resume-builder');
const { selectTemplateByJob, getTemplate } = require('../templates/elite-ats-template');
const { createEliteResume } = require('./docx-formatter');
const { generateBullets } = require('./llm-bullets');

const MAX_CACHE_SIZE = 100;

function getCacheKey(candidate, job) {
  const id = [candidate.id, job.id].filter(Boolean).join('-');
  if (id) return `resume:${id}`;
  const str = [
    candidate.full_name,
    job.id || job.title,
    job.company,
    (job.jd_raw || job.jd_clean || '').slice(0, 200),
  ].join('|');
  return 'resume:' + crypto.createHash('sha256').update(str).digest('hex').slice(0, 24);
}

function computeAtsScore(ats, job) {
  if (!job || !ats) return 95;
  const jd = (job.jd_clean || job.jd_raw || job.description || '').toLowerCase();
  const text = [
    ats.summary,
    (ats.coreCompetencies || []).map((sc) => sc.skills).join(' '),
    (ats.technicalSkills || []).map((sc) => sc.skills).join(' '),
    ...(ats.experience || []).flatMap((r) => [r.title, r.company, ...(r.bullets || [])]),
  ].join(' ').toLowerCase();
  if (!jd || !text) return 95;
  const jobWords = jd.split(/\s+/).filter(Boolean);
  const uniqueJob = [...new Set(jobWords)].filter((w) => w.length > 2);
  let matches = 0;
  for (const w of uniqueJob) {
    if (text.includes(w)) matches++;
  }
  const density = uniqueJob.length ? (matches / uniqueJob.length) * 100 : 0;
  const score = Math.min(99, 85 + Math.round(density * 0.3));
  return Math.max(90, score);
}

class FastResumeGenerator {
  constructor() {
    this.cache = new Map();
  }

  _evictIfNeeded() {
    if (this.cache.size <= MAX_CACHE_SIZE) return;
    const firstKey = this.cache.keys().next().value;
    if (firstKey) this.cache.delete(firstKey);
  }

  async generate(candidateData, jobData, options = {}) {
    const startTime = Date.now();
    const cacheKey = getCacheKey(candidateData, jobData);

    if (this.cache.has(cacheKey) && !options.forceRegenerate) {
      const cached = this.cache.get(cacheKey);
      const duration = Date.now() - startTime;
      return {
        buffer: cached.buffer,
        plainText: cached.plainText,
        atsScore: cached.atsScore,
        duration,
        cached: true,
        templateId: cached.templateId,
        bullets: cached.bullets || [],
      };
    }

    const bulletsResult = await generateBullets(candidateData, jobData);
    const ats = toAtsCandidate(
      candidateData,
      bulletsResult.experience,
      jobData,
      bulletsResult.summary
    );
    const template = options.templateKey ? getTemplate(options.templateKey) : selectTemplateByJob(jobData);
    const { buffer, plainText } = await createEliteResume(ats, template.id);
    const atsScore = computeAtsScore(ats, jobData);
    const duration = Date.now() - startTime;

    this.cache.set(cacheKey, { buffer, plainText, atsScore, templateId: template.id, bullets: bulletsResult.experience });
    this._evictIfNeeded();

    return {
      buffer,
      plainText,
      atsScore,
      duration,
      cached: false,
      templateId: template.id,
      bullets: bulletsResult.experience,
    };
  }

  getStats() {
    return { cacheSize: this.cache.size, maxCacheSize: MAX_CACHE_SIZE };
  }
}

const defaultGenerator = new FastResumeGenerator();

module.exports = { FastResumeGenerator, defaultGenerator, getCacheKey, computeAtsScore };
