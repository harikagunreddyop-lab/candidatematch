/**
 * Elite Multi-Dimensional ATS Scoring Engine v3
 *
 * Exceeds enterprise ATS (Workday, Greenhouse, Lever, iCIMS) with:
 * 1. Semantic skill matching via implications graph + contextual phrases
 * 2. Keyword density/prominence (section-aware, occurrence-weighted)
 * 3. Recency-weighted skill extraction (recent roles > old roles)
 * 4. Industry vertical alignment taxonomy
 * 5. Resume formatting/ATS-friendliness scoring
 * 6. Behavioral/culture-fit signal detection
 * 7. AI-powered nuanced evaluation
 *
 * Architecture: One AI call per JD (cached), one AI call per candidate×job.
 * All other scoring is deterministic for consistency + speed.
 */

import { error as logError } from '@/lib/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

const W = {
  keyword:    0.30,
  experience: 0.18,
  title:      0.14,
  education:  0.08,
  location:   0.08,
  formatting: 0.07,
  behavioral: 0.07,
  soft:       0.08,
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface JobRequirements {
  must_have_skills: string[];
  nice_to_have_skills: string[];
  implicit_skills: string[];
  min_years_experience: number | null;
  preferred_years_experience: number | null;
  seniority_level: string | null;
  required_education: string | null;
  preferred_education_fields: string[];
  certifications: string[];
  location_type: 'remote' | 'hybrid' | 'onsite' | null;
  location_city: string | null;
  visa_sponsorship: boolean | null;
  domain: string;
  industry_vertical: string | null;
  behavioral_keywords: string[];
  context_phrases: string[];
}

export interface DimensionScore {
  score: number;
  details: string;
  matched?: string[];
  missing?: string[];
}

export interface ATSScoreResult {
  total_score: number;
  dimensions: {
    keyword: DimensionScore;
    experience: DimensionScore;
    title: DimensionScore;
    education: DimensionScore;
    location: DimensionScore;
    formatting: DimensionScore;
    behavioral: DimensionScore;
    soft: DimensionScore;
  };
  reason: string;
  matched_keywords: string[];
  missing_keywords: string[];
}

interface CandidateData {
  primary_title?: string;
  secondary_titles?: string[];
  skills: string[];
  tools?: string[];
  experience: Array<{ company: string; title: string; start_date?: string; end_date?: string; current?: boolean; responsibilities?: string[] }>;
  education: Array<{ institution?: string; degree?: string; field?: string; graduation_date?: string; gpa?: string }>;
  certifications: Array<{ name: string; issuer?: string }>;
  location?: string;
  visa_status?: string;
  years_of_experience?: number;
  open_to_remote?: boolean;
  open_to_relocation?: boolean;
  target_locations?: string[];
  resume_text: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// SKILL SYNONYM DATABASE (70+ canonical groups)
// ═════════════════════════════════════════════════════════════════════════════

const SYNONYM_GROUPS: string[][] = [
  ['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'es2020'],
  ['typescript', 'ts'],
  ['react', 'react.js', 'reactjs', 'react js'],
  ['react native', 'reactnative', 'rn'],
  ['angular', 'angular.js', 'angularjs', 'angular 2+'],
  ['vue', 'vue.js', 'vuejs', 'vue 3'],
  ['next.js', 'nextjs', 'next js'],
  ['node', 'node.js', 'nodejs', 'node js'],
  ['express', 'express.js', 'expressjs'],
  ['python', 'python3', 'python 3'],
  ['java', 'java se', 'java ee', 'j2ee', 'java 8', 'java 11', 'java 17'],
  ['spring', 'spring boot', 'spring framework', 'springboot'],
  ['c#', 'csharp', 'c sharp', '.net', 'dotnet', 'asp.net'],
  ['c++', 'cpp', 'c plus plus'],
  ['go', 'golang', 'go lang'],
  ['rust', 'rust lang', 'rustlang'],
  ['ruby', 'ruby on rails', 'rails', 'ror'],
  ['php', 'laravel', 'symfony'],
  ['swift', 'swiftui'],
  ['kotlin', 'kotlin/jvm'],
  ['scala', 'scala lang'],
  ['sql', 'structured query language'],
  ['mysql', 'my sql'],
  ['postgresql', 'postgres', 'psql', 'pg'],
  ['mongodb', 'mongo', 'mongo db', 'nosql'],
  ['redis', 'redis cache'],
  ['elasticsearch', 'elastic search', 'elastic', 'opensearch'],
  ['dynamodb', 'dynamo db', 'dynamo'],
  ['cassandra', 'apache cassandra'],
  ['kafka', 'apache kafka', 'confluent kafka'],
  ['rabbitmq', 'rabbit mq', 'amqp'],
  ['aws', 'amazon web services', 'amazon aws'],
  ['gcp', 'google cloud', 'google cloud platform'],
  ['azure', 'microsoft azure', 'ms azure'],
  ['docker', 'containerization', 'containers'],
  ['kubernetes', 'k8s', 'kube', 'eks', 'aks', 'gke'],
  ['terraform', 'terraform iac', 'tf', 'hashicorp terraform'],
  ['ansible', 'ansible automation'],
  ['jenkins', 'jenkins ci'],
  ['ci/cd', 'cicd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery'],
  ['git', 'github', 'gitlab', 'bitbucket', 'version control'],
  ['rest', 'rest api', 'restful', 'restful api'],
  ['graphql', 'graph ql'],
  ['grpc', 'g rpc', 'protocol buffers', 'protobuf'],
  ['microservices', 'micro services', 'micro-services'],
  ['machine learning', 'ml', 'deep learning', 'dl'],
  ['artificial intelligence', 'ai'],
  ['nlp', 'natural language processing'],
  ['computer vision', 'cv', 'image recognition'],
  ['tensorflow', 'tensor flow'],
  ['pytorch', 'py torch', 'torch'],
  ['scikit-learn', 'sklearn', 'scikit learn'],
  ['pandas', 'pd'],
  ['numpy', 'np'],
  ['spark', 'apache spark', 'pyspark'],
  ['hadoop', 'apache hadoop', 'hdfs', 'mapreduce'],
  ['airflow', 'apache airflow'],
  ['dbt', 'data build tool'],
  ['snowflake', 'snowflake db'],
  ['databricks', 'data bricks'],
  ['tableau', 'tableau desktop'],
  ['power bi', 'powerbi', 'power-bi'],
  ['html', 'html5'],
  ['css', 'css3', 'scss', 'sass', 'less'],
  ['tailwind', 'tailwind css', 'tailwindcss'],
  ['webpack', 'webpack 5', 'bundler'],
  ['vite', 'vitejs'],
  ['agile', 'scrum', 'kanban', 'agile methodology'],
  ['jira', 'atlassian jira'],
  ['figma', 'figma design'],
  ['linux', 'unix', 'ubuntu', 'centos', 'debian'],
  ['oauth', 'oauth2', 'openid connect', 'oidc'],
  ['jwt', 'json web token'],
  ['websocket', 'websockets', 'socket.io', 'ws'],
];

const synonymMap = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canonical = group[0];
  for (const term of group) synonymMap.set(term.toLowerCase(), canonical);
}
function canonicalize(skill: string): string {
  const lower = skill.toLowerCase().trim();
  return synonymMap.get(lower) || lower;
}

// ═════════════════════════════════════════════════════════════════════════════
// SEMANTIC SKILL IMPLICATIONS GRAPH
// "distributed systems" experience implies knowledge of several concrete skills
// ═════════════════════════════════════════════════════════════════════════════

const SKILL_IMPLICATIONS: Record<string, string[]> = {
  'distributed systems':  ['microservices', 'kafka', 'redis', 'load balancing', 'scalability', 'message queue'],
  'cloud architecture':   ['aws', 'gcp', 'azure', 'terraform', 'kubernetes', 'docker', 'iac'],
  'cloud infrastructure': ['aws', 'gcp', 'azure', 'terraform', 'kubernetes', 'docker'],
  'full stack':           ['javascript', 'react', 'node', 'sql', 'rest', 'html', 'css'],
  'frontend development': ['javascript', 'react', 'html', 'css', 'typescript'],
  'backend development':  ['node', 'python', 'java', 'sql', 'rest', 'microservices'],
  'data pipeline':        ['spark', 'airflow', 'kafka', 'sql', 'python', 'etl'],
  'data warehouse':       ['sql', 'snowflake', 'dbt', 'etl', 'data modeling'],
  'machine learning':     ['python', 'tensorflow', 'pytorch', 'scikit-learn', 'numpy', 'pandas'],
  'deep learning':        ['python', 'tensorflow', 'pytorch', 'gpu', 'neural networks'],
  'devops':               ['docker', 'kubernetes', 'ci/cd', 'terraform', 'jenkins', 'linux'],
  'site reliability':     ['linux', 'docker', 'kubernetes', 'monitoring', 'alerting', 'incident management'],
  'mobile development':   ['swift', 'kotlin', 'react native', 'flutter'],
  'api development':      ['rest', 'graphql', 'grpc', 'authentication', 'rate limiting'],
  'database design':      ['sql', 'postgresql', 'mongodb', 'redis', 'data modeling', 'indexing'],
  'event-driven':         ['kafka', 'rabbitmq', 'event sourcing', 'cqrs', 'microservices'],
  'containerization':     ['docker', 'kubernetes', 'container orchestration'],
  'infrastructure as code': ['terraform', 'ansible', 'cloudformation', 'pulumi'],
  'real-time systems':    ['websocket', 'kafka', 'redis', 'streaming', 'low latency'],
  'search systems':       ['elasticsearch', 'solr', 'search engine', 'indexing', 'ranking'],
  'security engineering': ['oauth', 'encryption', 'penetration testing', 'vulnerability', 'compliance'],
  'ci/cd pipeline':       ['jenkins', 'github actions', 'gitlab ci', 'docker', 'automated testing'],
  'test automation':      ['selenium', 'cypress', 'jest', 'junit', 'pytest', 'testing'],
  'agile development':    ['scrum', 'kanban', 'sprint', 'jira', 'retrospective'],
};

const CONTEXTUAL_PHRASES: [RegExp, string[]][] = [
  [/built?\s+(?:rest|api|endpoint)/i, ['rest', 'api development']],
  [/scaled?\s+(?:system|service|app|platform)/i, ['scalability', 'distributed systems']],
  [/deploy(?:ed|ing)?\s+to\s+(?:cloud|aws|gcp|azure)/i, ['cloud architecture', 'devops']],
  [/(?:manage|maintain)(?:ed|ing)?\s+(?:database|db)/i, ['sql', 'database design']],
  [/(?:train|fine-?tun)(?:ed|ing)?\s+(?:model|neural|ml)/i, ['machine learning', 'python']],
  [/(?:design|architect)(?:ed|ing)?\s+(?:system|platform|solution)/i, ['system design', 'architecture']],
  [/(?:implement|develop)(?:ed|ing)?\s+(?:microservice|micro-service)/i, ['microservices', 'distributed systems']],
  [/(?:real-?time|streaming)\s+(?:data|processing|analytics)/i, ['kafka', 'real-time systems']],
  [/(?:million|billion|10k\+|100k\+)\s+(?:user|request|transaction|record)/i, ['scalability', 'performance']],
  [/(?:led|managed)\s+(?:team|group|engineers)\s+of\s+\d+/i, ['leadership', 'team management']],
  [/(?:reduce|improv|optimiz)(?:ed|ing)?\s+(?:latency|performance|cost|time)/i, ['performance optimization']],
  [/(?:automat|pipeline|workflow)(?:ed|ing)?\s+(?:deploy|test|build|ci)/i, ['ci/cd', 'automation']],
  [/(?:docker|container)(?:iz)?(?:ed|ing)?/i, ['docker', 'containerization']],
  [/(?:event[\s-]driven|pub[\s/]?sub|message\s+queue)/i, ['event-driven', 'kafka']],
  [/(?:oauth|jwt|authentication|authorization)\s+(?:system|flow|service)/i, ['security engineering', 'oauth']],
];

// ═════════════════════════════════════════════════════════════════════════════
// INDUSTRY VERTICAL TAXONOMY
// ═════════════════════════════════════════════════════════════════════════════

const INDUSTRY_VERTICALS: Record<string, string[]> = {
  fintech:      ['banking', 'payment', 'financial', 'trading', 'crypto', 'blockchain', 'insurance', 'lending', 'fintech', 'wealth', 'investment', 'hedge fund'],
  healthtech:   ['healthcare', 'medical', 'pharma', 'clinical', 'ehr', 'health tech', 'telemedicine', 'biotech', 'hipaa', 'patient', 'hospital'],
  ecommerce:    ['retail', 'marketplace', 'shopping', 'commerce', 'e-commerce', 'cart', 'checkout', 'fulfillment', 'inventory', 'shopify'],
  saas:         ['saas', 'subscription', 'platform', 'b2b', 'multi-tenant', 'self-service', 'onboarding', 'churn'],
  adtech:       ['advertising', 'ad tech', 'programmatic', 'rtb', 'dsp', 'ssp', 'campaign', 'impression', 'cpm'],
  edtech:       ['education', 'learning', 'lms', 'edtech', 'course', 'student', 'curriculum', 'training'],
  gaming:       ['gaming', 'game', 'unity', 'unreal', 'multiplayer', 'matchmaking', 'leaderboard'],
  cybersecurity:['security', 'cybersecurity', 'threat', 'vulnerability', 'soc', 'siem', 'intrusion', 'firewall'],
  ai_ml:        ['artificial intelligence', 'machine learning', 'deep learning', 'nlp', 'computer vision', 'recommendation', 'chatbot'],
  cloud:        ['cloud', 'infrastructure', 'iaas', 'paas', 'serverless', 'lambda', 'cloudformation'],
  media:        ['media', 'streaming', 'video', 'content', 'cdn', 'transcoding', 'publishing'],
  logistics:    ['logistics', 'supply chain', 'shipping', 'warehouse', 'fleet', 'routing', 'delivery'],
};

function detectVertical(text: string): string | null {
  const lower = text.toLowerCase();
  let bestMatch = '';
  let bestCount = 0;
  for (const [vertical, keywords] of Object.entries(INDUSTRY_VERTICALS)) {
    const count = keywords.filter(k => lower.includes(k)).length;
    if (count > bestCount) { bestCount = count; bestMatch = vertical; }
  }
  return bestCount >= 2 ? bestMatch : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL/CULTURE-FIT SIGNAL KEYWORDS
// ═════════════════════════════════════════════════════════════════════════════

const BEHAVIORAL_CATEGORIES: Record<string, RegExp[]> = {
  leadership:     [/\b(led|managed|directed|mentored|guided|supervised|coached|oversaw|headed)\b/gi],
  collaboration:  [/\b(collaborated|partnered|cross-functional|cross functional|team|stakeholder|liaison)\b/gi],
  communication:  [/\b(presented|published|documented|communicated|articulated|wrote|authored)\b/gi],
  innovation:     [/\b(built|created|designed|architected|invented|pioneered|introduced|launched)\b/gi],
  ownership:      [/\b(owned|responsible|accountable|drove|spearheaded|championed|initiated)\b/gi],
  problem_solving:[/\b(resolved|debugged|troubleshot|diagnosed|investigated|analyzed|solved|fixed)\b/gi],
  impact:         [/\d+%|\$\d+[kmb]?|\d+x\s+(improv|increas|reduc|faster)|saved\s+\$|reduced.*by|increased.*by|improved.*by/gi],
};

// ═════════════════════════════════════════════════════════════════════════════
// RESUME SECTION DETECTION
// ═════════════════════════════════════════════════════════════════════════════

interface ResumeSection {
  name: 'skills' | 'summary' | 'experience' | 'education' | 'certifications' | 'projects' | 'unknown';
  text: string;
  weight: number;
}

function parseResumeSections(text: string): ResumeSection[] {
  const lines = text.split('\n');
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection = { name: 'summary', text: '', weight: 1.2 };

  const SECTION_PATTERNS: [RegExp, ResumeSection['name'], number][] = [
    [/^(technical\s+)?skills|core\s+competenc|technologies|tech\s+stack/i, 'skills', 1.5],
    [/^summary|objective|profile|about/i, 'summary', 1.2],
    [/^(work\s+)?experience|employment|professional\s+experience|work\s+history/i, 'experience', 1.0],
    [/^education|academic/i, 'education', 0.5],
    [/^certif|licenses|accredit/i, 'certifications', 0.8],
    [/^project|portfolio|personal\s+project/i, 'projects', 0.9],
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let matched = false;
    for (const [pattern, name, weight] of SECTION_PATTERNS) {
      if (pattern.test(trimmed) && trimmed.length < 60) {
        if (currentSection.text.trim()) sections.push(currentSection);
        currentSection = { name, text: '', weight };
        matched = true;
        break;
      }
    }
    if (!matched) currentSection.text += trimmed + '\n';
  }
  if (currentSection.text.trim()) sections.push(currentSection);

  if (sections.length === 0) {
    sections.push({ name: 'unknown', text, weight: 1.0 });
  }
  return sections;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. ENHANCED JD REQUIREMENT EXTRACTION
// ═════════════════════════════════════════════════════════════════════════════

export async function extractJobRequirements(
  jobTitle: string,
  jobDescription: string,
  jobLocation?: string,
): Promise<JobRequirements | null> {
  if (!ANTHROPIC_API_KEY || !jobDescription) return null;

  const prompt = `You are an expert technical recruiter and ATS system. Extract ALL structured requirements from this job description with extreme precision.

JOB TITLE: ${jobTitle}
LOCATION: ${jobLocation || 'Not specified'}

JOB DESCRIPTION:
${jobDescription.slice(0, 3500)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "must_have_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill1", "skill2"],
  "implicit_skills": ["skill1", "skill2"],
  "min_years_experience": <number or null>,
  "preferred_years_experience": <number or null>,
  "seniority_level": "<intern|junior|mid|senior|staff|principal|lead|manager|director|null>",
  "required_education": "<high_school|associate|bachelor|master|phd|null>",
  "preferred_education_fields": ["field1", "field2"],
  "certifications": ["cert1"],
  "location_type": "<remote|hybrid|onsite|null>",
  "location_city": "<city, state or null>",
  "visa_sponsorship": <true|false|null>,
  "domain": "<software-engineering|frontend|backend|fullstack|data-engineering|data-science|devops|mobile|qa|security|management|design|general>",
  "industry_vertical": "<fintech|healthtech|ecommerce|saas|adtech|edtech|gaming|cybersecurity|ai_ml|cloud|media|logistics|null>",
  "behavioral_keywords": ["keyword1", "keyword2"],
  "context_phrases": ["phrase that implies technical capability"]
}

Extraction rules:
- must_have_skills: Explicitly required technologies/tools/frameworks (lowercase, specific)
- nice_to_have_skills: "preferred", "bonus", "plus", "familiarity with" (lowercase)
- implicit_skills: Skills implied by the role but not explicitly listed. E.g. a "Senior React Developer" role implies JavaScript, HTML, CSS, git even if not listed. A "Data Pipeline Engineer" implies SQL, Python, ETL even if not listed.
- behavioral_keywords: Action verbs or traits the JD emphasizes (e.g., "collaborative", "self-starter", "mentoring")
- context_phrases: Technical phrases that indicate capability areas (e.g., "build scalable distributed systems", "design RESTful APIs", "manage cloud infrastructure")
- Infer seniority from title + years if not explicit
- Return null for truly undeterminable fields`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      must_have_skills: parsed.must_have_skills || [],
      nice_to_have_skills: parsed.nice_to_have_skills || [],
      implicit_skills: parsed.implicit_skills || [],
      min_years_experience: parsed.min_years_experience ?? null,
      preferred_years_experience: parsed.preferred_years_experience ?? null,
      seniority_level: parsed.seniority_level || null,
      required_education: parsed.required_education || null,
      preferred_education_fields: parsed.preferred_education_fields || [],
      certifications: parsed.certifications || [],
      location_type: parsed.location_type || null,
      location_city: parsed.location_city || null,
      visa_sponsorship: parsed.visa_sponsorship ?? null,
      domain: parsed.domain || 'general',
      industry_vertical: parsed.industry_vertical || null,
      behavioral_keywords: parsed.behavioral_keywords || [],
      context_phrases: parsed.context_phrases || [],
    } as JobRequirements;
  } catch (e) {
    logError('[ats-engine] JD extraction failed', e);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. KEYWORD SCORING (semantic, density, prominence, recency)
// ═════════════════════════════════════════════════════════════════════════════

function scoreKeywords(
  requirements: JobRequirements,
  candidateSkills: string[],
  candidateTools: string[],
  resumeText: string,
  experience: CandidateData['experience'],
): DimensionScore {
  const sections = parseResumeSections(resumeText);
  const resumeLower = resumeText.toLowerCase();

  // Build candidate skill set with section-aware prominence
  const candidateSkillSet = new Set<string>();
  const skillProminence = new Map<string, number>();

  for (const s of [...candidateSkills, ...candidateTools]) {
    const c = canonicalize(s);
    candidateSkillSet.add(c);
    skillProminence.set(c, (skillProminence.get(c) || 0) + 1.5); // explicit skill listing = high weight
  }

  // Extract skills from resume sections with section-aware weighting
  for (const section of sections) {
    const sectionLower = section.text.toLowerCase();
    for (const group of SYNONYM_GROUPS) {
      const canonical = group[0];
      for (const term of group) {
        if (sectionLower.includes(term)) {
          candidateSkillSet.add(canonical);
          const count = (sectionLower.split(term).length - 1);
          const weighted = count * section.weight;
          skillProminence.set(canonical, (skillProminence.get(canonical) || 0) + weighted);
          break;
        }
      }
    }
  }

  // Extract implied skills from contextual phrases in resume
  for (const [pattern, impliedSkills] of CONTEXTUAL_PHRASES) {
    if (pattern.test(resumeText)) {
      for (const skill of impliedSkills) {
        const c = canonicalize(skill);
        candidateSkillSet.add(c);
        skillProminence.set(c, (skillProminence.get(c) || 0) + 0.5);
      }
    }
  }

  // Expand candidate skills via implications graph
  const expandedSkills = new Set(candidateSkillSet);
  for (const skill of Array.from(candidateSkillSet)) {
    const implied = SKILL_IMPLICATIONS[skill];
    if (implied) {
      for (const s of implied) {
        const c = canonicalize(s);
        expandedSkills.add(c);
        if (!skillProminence.has(c)) skillProminence.set(c, 0.3); // implied = low prominence
      }
    }
  }

  // Recency weighting: extract skills from recent vs old roles
  const now = new Date().getFullYear();
  const recentSkills = new Set<string>();
  const oldSkills = new Set<string>();
  for (const exp of experience) {
    const endYear = exp.current ? now : (exp.end_date ? new Date(exp.end_date).getFullYear() : now);
    const isRecent = (now - endYear) <= 2;
    const responsibilities = (exp.responsibilities || []).join(' ').toLowerCase();
    const titleLower = (exp.title || '').toLowerCase();
    const combined = responsibilities + ' ' + titleLower;

    for (const group of SYNONYM_GROUPS) {
      for (const term of group) {
        if (combined.includes(term)) {
          const c = group[0];
          (isRecent ? recentSkills : oldSkills).add(c);
          break;
        }
      }
    }
  }

  // Score matching
  const allRequired = [
    ...requirements.must_have_skills.map(s => ({ skill: canonicalize(s), type: 'must' as const })),
    ...requirements.nice_to_have_skills.map(s => ({ skill: canonicalize(s), type: 'nice' as const })),
    ...requirements.implicit_skills.map(s => ({ skill: canonicalize(s), type: 'implicit' as const })),
  ];

  // Add context phrase matching
  for (const phrase of requirements.context_phrases) {
    const phraseLower = phrase.toLowerCase();
    for (const [concept, implied] of Object.entries(SKILL_IMPLICATIONS)) {
      if (phraseLower.includes(concept)) {
        for (const s of implied) {
          allRequired.push({ skill: canonicalize(s), type: 'implicit' });
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueRequired = allRequired.filter(r => { if (seen.has(r.skill + r.type)) return false; seen.add(r.skill + r.type); return true; });

  const matched: string[] = [];
  const missing: string[] = [];
  let mustScore = 0, mustTotal = 0;
  let niceScore = 0, niceTotal = 0;
  let implicitScore = 0, implicitTotal = 0;

  for (const { skill, type } of uniqueRequired) {
    const directMatch = expandedSkills.has(skill);
    const textMatch = !directMatch && resumeLower.includes(skill);
    const found = directMatch || textMatch;

    if (type === 'must') {
      mustTotal++;
      if (found) {
        const prominence = skillProminence.get(skill) || 0.5;
        const recencyBonus = recentSkills.has(skill) ? 1.0 : oldSkills.has(skill) ? 0.7 : 0.85;
        mustScore += Math.min(1.0, prominence * 0.3 + 0.7) * recencyBonus;
        matched.push(skill);
      } else {
        missing.push(skill);
      }
    } else if (type === 'nice') {
      niceTotal++;
      if (found) {
        niceScore += recentSkills.has(skill) ? 1.0 : 0.8;
        matched.push(skill);
      }
    } else {
      implicitTotal++;
      if (found) implicitScore += 0.8;
    }
  }

  const mustRatio = mustTotal > 0 ? mustScore / mustTotal : 1;
  const niceRatio = niceTotal > 0 ? niceScore / niceTotal : 0.5;
  const implicitRatio = implicitTotal > 0 ? implicitScore / implicitTotal : 0.5;

  let raw = (mustRatio * 0.65 + niceRatio * 0.20 + implicitRatio * 0.15) * 100;

  // Penalty for missing critical must-haves
  if (mustTotal > 0 && mustScore === 0) raw = Math.min(raw, 15);
  else if (mustTotal >= 3 && mustRatio < 0.33) raw = Math.min(raw, 30);
  else if (mustTotal >= 3 && mustRatio < 0.5) raw -= 10;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const detail = mustTotal > 0 ? `${Math.round(mustScore)}/${mustTotal} must-have, ${Math.round(niceScore)}/${niceTotal} nice, ${Math.round(implicitScore)}/${implicitTotal} implicit` : 'No explicit requirements';

  return { score, details: detail, matched: Array.from(new Set(matched)), missing: Array.from(new Set(missing)) };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. EXPERIENCE SCORING (with industry vertical matching)
// ═════════════════════════════════════════════════════════════════════════════

const SENIORITY_YEARS: Record<string, [number, number]> = {
  intern: [0, 0], junior: [0, 2], mid: [2, 5], senior: [5, 8],
  staff: [8, 12], principal: [12, 20], lead: [5, 10], manager: [6, 12], director: [10, 20],
};

function scoreExperience(
  requirements: JobRequirements,
  candidateYears: number | null,
  candidateExperience: CandidateData['experience'],
  resumeText: string,
): DimensionScore {
  const seniority = requirements.seniority_level;
  let years = candidateYears;
  if (years == null && candidateExperience.length > 0) {
    const dates = candidateExperience.map(e => e.start_date ? new Date(e.start_date).getFullYear() : null).filter(Boolean) as number[];
    if (dates.length > 0) years = new Date().getFullYear() - Math.min(...dates);
  }
  if (years == null) years = 0;

  let targetMin = requirements.min_years_experience;
  let targetMax = requirements.preferred_years_experience;
  if (targetMin == null && seniority && SENIORITY_YEARS[seniority]) {
    [targetMin, targetMax] = SENIORITY_YEARS[seniority];
  }

  let yearsScore: number;
  let yearsDetail: string;
  if (targetMin == null) {
    yearsScore = 70;
    yearsDetail = `${years}yr (no requirement)`;
  } else {
    const target = targetMax || targetMin;
    if (years >= target) { yearsScore = 100; yearsDetail = `${years}yr meets ${target}yr+`; }
    else if (years >= targetMin) {
      const ratio = (years - targetMin) / Math.max(1, target - targetMin);
      yearsScore = Math.round(75 + ratio * 25);
      yearsDetail = `${years}yr within ${targetMin}-${target}yr range`;
    } else {
      const gap = targetMin - years;
      yearsScore = gap <= 1 ? 60 : gap <= 2 ? 40 : Math.max(10, 40 - gap * 8);
      yearsDetail = `${years}yr, ${gap}yr below ${targetMin}yr min`;
    }
  }

  // Industry vertical matching
  let verticalBonus = 0;
  if (requirements.industry_vertical) {
    const candidateVertical = detectVertical(resumeText);
    if (candidateVertical === requirements.industry_vertical) {
      verticalBonus = 10;
      yearsDetail += ` + ${requirements.industry_vertical} industry match`;
    } else if (candidateVertical) {
      yearsDetail += ` (different industry: ${candidateVertical})`;
    }
  }

  const score = Math.min(100, yearsScore + verticalBonus);
  return { score, details: yearsDetail };
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. TITLE/ROLE ALIGNMENT
// ═════════════════════════════════════════════════════════════════════════════

function scoreTitle(
  requirements: JobRequirements,
  jobTitle: string,
  candidateTitle: string,
  secondaryTitles: string[],
): DimensionScore {
  const jobLower = jobTitle.toLowerCase();
  const allTitles = [candidateTitle.toLowerCase(), ...secondaryTitles.map(t => t.toLowerCase())].filter(Boolean);

  for (const t of allTitles) {
    if (t === jobLower || jobLower.includes(t) || t.includes(jobLower)) {
      return { score: 100, details: `Direct title match` };
    }
  }

  const jobDomain = requirements.domain;
  const candidateDomains = allTitles.map(classifyTitleDomain);

  if (candidateDomains.includes(jobDomain)) return { score: 85, details: `Same domain: ${jobDomain}` };

  const COMPAT: Record<string, string[]> = {
    'software-engineering': ['fullstack', 'backend', 'frontend'],
    'frontend': ['fullstack', 'software-engineering', 'mobile'],
    'backend': ['fullstack', 'software-engineering'],
    'fullstack': ['frontend', 'backend', 'software-engineering'],
    'data-engineering': ['data-science', 'backend'],
    'data-science': ['data-engineering'],
    'devops': ['software-engineering', 'backend'],
    'mobile': ['frontend', 'fullstack'],
  };
  if (candidateDomains.some(d => (COMPAT[jobDomain] || []).includes(d))) {
    return { score: 65, details: `Adjacent domain` };
  }

  const jobSen = extractSeniority(jobLower);
  const candSen = extractSeniority(allTitles[0] || '');
  const senBonus = jobSen === candSen ? 10 : 0;

  if (candidateDomains.includes('general')) return { score: 45 + senBonus, details: `Generic title` };
  return { score: Math.max(10, 25 + senBonus), details: `Domain mismatch: ${candidateDomains[0]} vs ${jobDomain}` };
}

function classifyTitleDomain(title: string): string {
  const t = title.toLowerCase();
  if (/data\s*(engineer|architect|platform|pipeline|warehouse)|etl|big\s*data/i.test(t)) return 'data-engineering';
  if (/data\s*(scien|analy)|machine\s*learn|\bml\b|\bai\b|deep\s*learn|\bnlp\b/i.test(t)) return 'data-science';
  if (/devops|\bsre\b|site\s*reliab|cloud\s*(eng|arch)|platform\s*eng|infrastructure/i.test(t)) return 'devops';
  if (/full[\s-]*stack/i.test(t)) return 'fullstack';
  if (/front[\s-]*end|ui\s*(dev|eng)|react\s*(dev|eng)|angular|vue/i.test(t)) return 'frontend';
  if (/back[\s-]*end/i.test(t)) return 'backend';
  if (/\bios\b|android|mobile|react\s*native|flutter/i.test(t)) return 'mobile';
  if (/\bqa\b|quality|test\s*(auto|eng)|\bsdet\b/i.test(t)) return 'qa';
  if (/secur|cyber|infosec/i.test(t)) return 'security';
  if (/product\s*manag|program\s*manag|project\s*manag|engineering\s*manag|\bscrum\b/i.test(t)) return 'management';
  if (/\bux\b|ui\s*design|product\s*design/i.test(t)) return 'design';
  if (/software|developer|engineer|programmer|java(?!script)|python|\.net|c#|ruby|php|\bnode\b|spring|golang|\bgo\b/i.test(t)) return 'software-engineering';
  return 'general';
}

function extractSeniority(title: string): string {
  if (/\b(intern|trainee)\b/i.test(title)) return 'intern';
  if (/\bjunior\b|\bjr\b|\bentry\b|\bassociate\b/i.test(title)) return 'junior';
  if (/\bsenior\b|\bsr\b/i.test(title)) return 'senior';
  if (/\bstaff\b/i.test(title)) return 'staff';
  if (/\bprincipal\b/i.test(title)) return 'principal';
  if (/\blead\b|\btech lead\b/i.test(title)) return 'lead';
  if (/\bmanager\b|\bdirector\b|\bvp\b|\bhead of\b/i.test(title)) return 'manager';
  return 'mid';
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. EDUCATION SCORING
// ═════════════════════════════════════════════════════════════════════════════

const DEGREE_RANK: Record<string, number> = {
  phd: 5, doctorate: 5, 'ph.d': 5,
  master: 4, masters: 4, mba: 4, ms: 4, ma: 4, msc: 4, mtech: 4,
  bachelor: 3, bachelors: 3, bs: 3, ba: 3, btech: 3, be: 3, bsc: 3,
  associate: 2, associates: 2, aa: 2, as: 2,
  high_school: 1, diploma: 1, ged: 1,
};

function scoreEducation(
  requirements: JobRequirements,
  candidateEducation: CandidateData['education'],
  candidateCerts: CandidateData['certifications'],
): DimensionScore {
  const reqDegree = requirements.required_education;
  const reqFields = requirements.preferred_education_fields.map(f => f.toLowerCase());
  const reqCerts = requirements.certifications.map(c => c.toLowerCase());

  if (!reqDegree && reqFields.length === 0 && reqCerts.length === 0) {
    return { score: 75, details: 'No education requirements' };
  }

  let degreeScore = 75, fieldScore = 75, certScore = 75;

  if (reqDegree) {
    const reqRank = DEGREE_RANK[reqDegree.toLowerCase()] || 0;
    let bestRank = 0;
    for (const edu of candidateEducation) {
      const d = (edu.degree || '').toLowerCase();
      for (const [key, rank] of Object.entries(DEGREE_RANK)) {
        if (d.includes(key) && rank > bestRank) bestRank = rank;
      }
    }
    degreeScore = bestRank >= reqRank ? 100 : bestRank === reqRank - 1 ? 65 : bestRank > 0 ? 35 : 15;
  }

  if (reqFields.length > 0 && candidateEducation.length > 0) {
    const candFields = candidateEducation.map(e => (e.field || e.degree || '').toLowerCase());
    fieldScore = reqFields.some(rf => candFields.some(cf => cf.includes(rf) || rf.includes(cf))) ? 100 : 40;
  }

  if (reqCerts.length > 0) {
    const candCerts = candidateCerts.map(c => c.name.toLowerCase());
    const matched = reqCerts.filter(rc => candCerts.some(cc => cc.includes(rc) || rc.includes(cc))).length;
    certScore = Math.round((matched / reqCerts.length) * 100);
  }

  const w = { d: reqDegree ? 0.5 : 0.3, f: 0.3, c: reqCerts.length > 0 ? 0.2 : 0.1 };
  const total = w.d + w.f + w.c;
  const score = Math.round((degreeScore * w.d + fieldScore * w.f + certScore * w.c) / total);

  const parts: string[] = [];
  if (reqDegree) parts.push(`Degree: ${degreeScore >= 65 ? 'meets' : 'below'} ${reqDegree}`);
  if (reqFields.length > 0) parts.push(`Field: ${fieldScore >= 65 ? 'relevant' : 'different'}`);
  if (reqCerts.length > 0) parts.push(`Certs: ${certScore > 0 ? 'partial' : 'missing'}`);

  return { score, details: parts.join(', ') || 'Evaluated' };
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. LOCATION & VISA
// ═════════════════════════════════════════════════════════════════════════════

function scoreLocation(
  requirements: JobRequirements,
  candidateLocation: string,
  candidateVisa: string,
  openToRemote: boolean,
  openToRelocation: boolean,
  targetLocations: string[],
): DimensionScore {
  const jobLocType = requirements.location_type;
  const jobCity = (requirements.location_city || '').toLowerCase();
  const candLoc = (candidateLocation || '').toLowerCase();
  const candTargets = targetLocations.map(l => l.toLowerCase());

  if (jobLocType === 'remote') {
    return openToRemote ? { score: 100, details: 'Remote — open to remote' } : { score: 80, details: 'Remote available' };
  }

  let locScore = 75;
  let locDetail = 'Location compatible';

  if (jobCity) {
    const match = candLoc.includes(jobCity) || jobCity.includes(candLoc) || candTargets.some(t => t.includes(jobCity) || jobCity.includes(t));
    if (match) { locScore = 100; locDetail = `Location match: ${jobCity}`; }
    else if (openToRelocation) { locScore = 70; locDetail = 'Open to relocation'; }
    else if (jobLocType === 'hybrid') { locScore = 50; locDetail = `Hybrid in ${jobCity}`; }
    else { locScore = 30; locDetail = `Onsite ${jobCity}, no relocation`; }
  }

  const visa = (candidateVisa || '').toLowerCase();
  if (requirements.visa_sponsorship === false && /h1b|opt|visa|sponsorship/.test(visa)) {
    locScore = Math.max(10, locScore - 40);
    locDetail += ' — no visa sponsorship';
  }

  return { score: locScore, details: locDetail };
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. RESUME FORMATTING / ATS-FRIENDLINESS SCORE
// ═════════════════════════════════════════════════════════════════════════════

function scoreFormatting(resumeText: string, sections: ResumeSection[]): DimensionScore {
  let score = 50;
  const issues: string[] = [];
  const goods: string[] = [];

  // Section detection
  const sectionNames = sections.map(s => s.name);
  const hasSkills = sectionNames.includes('skills');
  const hasExperience = sectionNames.includes('experience');
  const hasEducation = sectionNames.includes('education');
  const hasSummary = sectionNames.includes('summary');

  if (hasSkills) { score += 10; goods.push('Skills section'); }
  else issues.push('No skills section');

  if (hasExperience) { score += 10; goods.push('Experience section'); }
  else issues.push('No experience section');

  if (hasEducation) { score += 5; goods.push('Education section'); }
  if (hasSummary) { score += 5; goods.push('Summary'); }

  // Content quality checks
  const lines = resumeText.split('\n').filter(l => l.trim().length > 0);
  if (lines.length >= 15 && lines.length <= 80) { score += 5; goods.push('Good length'); }
  else if (lines.length < 10) { score -= 10; issues.push('Too short'); }
  else if (lines.length > 120) { score -= 5; issues.push('Very long'); }

  // Measurable achievements (numbers, percentages, dollar amounts)
  const metricCount = (resumeText.match(/\d+%|\$[\d,.]+[kmb]?|\d+x\s|saved|reduced|increased|improved|grew|generated/gi) || []).length;
  if (metricCount >= 5) { score += 10; goods.push(`${metricCount} impact metrics`); }
  else if (metricCount >= 2) { score += 5; goods.push(`${metricCount} metrics`); }
  else { issues.push('Few quantified achievements'); }

  // Date formatting (shows work history has dates)
  const dateCount = (resumeText.match(/\b(20\d{2}|19\d{2})\b/g) || []).length;
  if (dateCount >= 3) { score += 5; goods.push('Dated work history'); }
  else issues.push('Missing dates');

  // Contact information signals
  if (/[\w.-]+@[\w.-]+\.\w+/.test(resumeText)) score += 2;
  if (/linkedin\.com|github\.com/.test(resumeText.toLowerCase())) score += 3;

  score = Math.max(0, Math.min(100, score));
  const detail = goods.length > 0 ? goods.slice(0, 3).join(', ') : issues.slice(0, 2).join(', ');

  return { score, details: detail || 'Basic formatting' };
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. BEHAVIORAL / CULTURE-FIT SIGNALS (deterministic)
// ═════════════════════════════════════════════════════════════════════════════

function scoreBehavioral(
  requirements: JobRequirements,
  resumeText: string,
): DimensionScore {
  const reqBehavioral = requirements.behavioral_keywords.map(k => k.toLowerCase());

  // Count behavioral signals in resume
  const signalCounts: Record<string, number> = {};
  for (const [category, patterns] of Object.entries(BEHAVIORAL_CATEGORIES)) {
    let count = 0;
    for (const pattern of patterns) {
      const matches = resumeText.match(pattern);
      count += matches?.length || 0;
    }
    signalCounts[category] = count;
  }

  const totalSignals = Object.values(signalCounts).reduce((a, b) => a + b, 0);
  const categoriesPresent = Object.values(signalCounts).filter(c => c > 0).length;

  // Base score from signal diversity and volume
  let score = 30;
  if (totalSignals >= 15) score += 25;
  else if (totalSignals >= 8) score += 20;
  else if (totalSignals >= 4) score += 10;

  if (categoriesPresent >= 5) score += 20;
  else if (categoriesPresent >= 3) score += 15;
  else if (categoriesPresent >= 2) score += 10;

  // Impact signals (quantified achievements) are weighted highest
  if (signalCounts.impact >= 5) score += 15;
  else if (signalCounts.impact >= 2) score += 10;
  else if (signalCounts.impact >= 1) score += 5;

  // Match against JD behavioral requirements
  if (reqBehavioral.length > 0) {
    const resumeLower = resumeText.toLowerCase();
    const matched = reqBehavioral.filter(k => resumeLower.includes(k)).length;
    const ratio = matched / reqBehavioral.length;
    score += Math.round(ratio * 10);
  }

  score = Math.max(0, Math.min(100, score));

  const topSignals = Object.entries(signalCounts).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).slice(0, 3).map(([k]) => k);
  const detail = topSignals.length > 0 ? `Signals: ${topSignals.join(', ')} (${totalSignals} total)` : 'Few behavioral signals';

  return { score, details: detail };
}

// ═════════════════════════════════════════════════════════════════════════════
// 9. AI SOFT FACTOR EVALUATION (career trajectory + growth + nuance)
// ═════════════════════════════════════════════════════════════════════════════

async function scoreSoftFactors(
  jobTitle: string,
  jobDescription: string,
  candidateTitle: string,
  resumeText: string,
  keywordResult: DimensionScore,
  behavioralResult: DimensionScore,
): Promise<DimensionScore> {
  if (!ANTHROPIC_API_KEY) return { score: 50, details: 'AI unavailable' };

  const prompt = `You are an elite hiring manager doing final-round evaluation. Score this candidate 0-100 on nuanced fit factors that deterministic systems cannot capture:

1. Career trajectory: Is the candidate's career path progressing toward this role? (weight: 30%)
2. Domain depth: Does the resume show deep expertise vs surface-level familiarity? (weight: 25%)
3. Growth potential: Could this candidate excel and grow even if not 100% matching today? (weight: 20%)
4. Culture signals: Does the writing style and achievement framing suggest the right mindset? (weight: 15%)
5. Red flags: Unexplained gaps, job hopping, inconsistencies, overly generic language? (weight: 10%, deductive)

Context: Keyword match found ${keywordResult.matched?.length || 0} required skills, missing ${keywordResult.missing?.length || 0}. Behavioral analysis found: ${behavioralResult.details}.

JOB: ${jobTitle}
JD: ${jobDescription.slice(0, 600)}

CANDIDATE: ${candidateTitle}
RESUME: ${resumeText.slice(0, 1800)}

Return ONLY valid JSON: { "score": <0-100>, "details": "<1 sentence>" }`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 150, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return { score: 50, details: 'AI unavailable' };
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { score: 50, details: 'Parse error' };
    const parsed = JSON.parse(jsonMatch[0]);
    return { score: Math.max(0, Math.min(100, parseInt(String(parsed.score), 10) || 50)), details: parsed.details || 'Evaluated' };
  } catch {
    return { score: 50, details: 'AI evaluation failed' };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: COMPUTE FULL ATS SCORE
// ═════════════════════════════════════════════════════════════════════════════

export async function computeATSScore(
  jobTitle: string,
  jobDescription: string,
  requirements: JobRequirements,
  candidate: CandidateData,
): Promise<ATSScoreResult> {
  const sections = parseResumeSections(candidate.resume_text);

  const keyword = scoreKeywords(requirements, candidate.skills, candidate.tools || [], candidate.resume_text, candidate.experience);
  const experience = scoreExperience(requirements, candidate.years_of_experience ?? null, candidate.experience, candidate.resume_text);
  const title = scoreTitle(requirements, jobTitle, candidate.primary_title || '', candidate.secondary_titles || []);
  const education = scoreEducation(requirements, candidate.education, candidate.certifications);
  const location = scoreLocation(requirements, candidate.location || '', candidate.visa_status || '', candidate.open_to_remote ?? true, candidate.open_to_relocation ?? false, candidate.target_locations || []);
  const formatting = scoreFormatting(candidate.resume_text, sections);
  const behavioral = scoreBehavioral(requirements, candidate.resume_text);
  const soft = await scoreSoftFactors(jobTitle, jobDescription, candidate.primary_title || '', candidate.resume_text, keyword, behavioral);

  let total = Math.round(
    keyword.score * W.keyword +
    experience.score * W.experience +
    title.score * W.title +
    education.score * W.education +
    location.score * W.location +
    formatting.score * W.formatting +
    behavioral.score * W.behavioral +
    soft.score * W.soft
  );

  // Hard caps for domain mismatch
  if (title.score <= 25) total = Math.min(total, 30);
  else if (title.score <= 45) total = Math.min(total, 55);

  total = Math.max(0, Math.min(100, total));

  const dims = { keyword, experience, title, education, location, formatting, behavioral, soft };
  const strongest = Object.entries(dims).sort(([, a], [, b]) => b.score - a.score)[0];
  const weakest = Object.entries(dims).sort(([, a], [, b]) => a.score - b.score)[0];

  const reason = total >= 82
    ? `Strong match — ${strongest[1].details}`
    : total >= 75
    ? `Moderate — best: ${strongest[0]} (${strongest[1].score}), gap: ${weakest[0]} (${weakest[1].score})`
    : total >= 50
    ? `Below threshold — ${weakest[0]}: ${weakest[1].details}`
    : `Poor fit — ${weakest[0]}: ${weakest[1].details}`;

  return {
    total_score: total,
    dimensions: { keyword, experience, title, education, location, formatting, behavioral, soft },
    reason,
    matched_keywords: keyword.matched || [],
    missing_keywords: keyword.missing || [],
  };
}
