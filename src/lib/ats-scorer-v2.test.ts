import { describe, it, expect } from 'vitest';
import { computeATSScoreV2, W_V2, _test, type ScorerInput } from '@/lib/ats-scorer-v2';
import type { JobRequirements } from '@/lib/ats-engine';

const { evidenceStrength, keywordOverlapProxy, clip, safeDate } = _test;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequirements(overrides?: Partial<JobRequirements>): JobRequirements {
  return {
    must_have_skills: [],
    nice_to_have_skills: [],
    implicit_skills: [],
    min_years_experience: null,
    preferred_years_experience: null,
    seniority_level: null,
    required_education: null,
    preferred_education_fields: [],
    certifications: [],
    location_type: null,
    location_city: null,
    visa_sponsorship: null,
    domain: 'software-engineering',
    industry_vertical: null,
    behavioral_keywords: [],
    context_phrases: [],
    responsibilities: [],
    ...overrides,
  };
}

function makeInput(overrides?: Partial<ScorerInput>): ScorerInput {
  return {
    requirements: makeRequirements(),
    candidateSkills: [],
    candidateTools: [],
    resumeText: '',
    experience: [],
    education: [],
    certifications: [],
    primary_title: undefined,
    secondary_titles: undefined,
    ...overrides,
  };
}

// ── clip ─────────────────────────────────────────────────────────────────────

describe('clip', () => {
  it('clamps below lo', () => expect(clip(-5, 0, 100)).toBe(0));
  it('clamps above hi', () => expect(clip(150, 0, 100)).toBe(100));
  it('returns value within range', () => expect(clip(42, 0, 100)).toBe(42));
});

// ── evidenceStrength ─────────────────────────────────────────────────────────

describe('evidenceStrength', () => {
  it('returns 0 when no evidence at all', () => {
    expect(evidenceStrength({ bullet: 0, project: 0, list: 0 })).toBe(0);
  });

  it('gives ≥ 0.40 for skills-list-only entry', () => {
    const E = evidenceStrength({ bullet: 0, project: 0, list: 1 });
    expect(E).toBeGreaterThanOrEqual(0.40);
    expect(E).toBeLessThanOrEqual(0.55);
  });

  it('gives higher evidence for bullet mentions than list-only', () => {
    const listOnly = evidenceStrength({ bullet: 0, project: 0, list: 1 });
    const bulletAndList = evidenceStrength({ bullet: 3, project: 0, list: 1 });
    expect(bulletAndList).toBeGreaterThan(listOnly);
  });

  it('adds corroboration bonus when listed AND in bullets', () => {
    const bulletsOnly = evidenceStrength({ bullet: 2, project: 0, list: 0 });
    const bulletsAndList = evidenceStrength({ bullet: 2, project: 0, list: 1 });
    expect(bulletsAndList).toBeGreaterThan(bulletsOnly);
  });

  it('caps list-only at 0.55', () => {
    const E = evidenceStrength({ bullet: 0, project: 0, list: 10 });
    expect(E).toBeLessThanOrEqual(0.55);
  });

  it('gives strong evidence for multiple bullet mentions', () => {
    const E = evidenceStrength({ bullet: 5, project: 2, list: 1 });
    expect(E).toBeGreaterThanOrEqual(0.70);
  });
});

// ── keywordOverlapProxy ──────────────────────────────────────────────────────

describe('keywordOverlapProxy', () => {
  it('returns 0.5 for empty inputs', () => {
    expect(keywordOverlapProxy([], [])).toBe(0.5);
    expect(keywordOverlapProxy(['Build REST APIs'], [])).toBe(0.5);
  });

  it('returns high score when bullets overlap with responsibilities', () => {
    const jdResp = ['Build and maintain REST APIs', 'Deploy microservices to AWS'];
    const bullets = [
      'Built RESTful API endpoints serving 10k requests/sec',
      'Deployed microservices using AWS ECS and Docker',
      'Maintained monitoring dashboards for API health',
    ];
    const score = keywordOverlapProxy(jdResp, bullets);
    expect(score).toBeGreaterThan(0.60);
  });

  it('returns low score when bullets are unrelated', () => {
    const jdResp = ['Build and maintain REST APIs', 'Deploy microservices to AWS'];
    const bullets = [
      'Conducted financial audits for Fortune 500 clients',
      'Prepared quarterly compliance reports',
    ];
    const score = keywordOverlapProxy(jdResp, bullets);
    expect(score).toBeLessThan(0.50);
  });
});

// ── computeATSScoreV2 — end-to-end scenarios ────────────────────────────────

describe('computeATSScoreV2', () => {
  it('returns a valid score structure', () => {
    const input = makeInput({
      requirements: makeRequirements({ must_have_skills: ['Python'] }),
      candidateSkills: ['Python'],
      resumeText: 'Skills: Python\nExperience: Built data pipelines.',
    });
    const out = computeATSScoreV2(input);
    expect(out.total_score).toBeGreaterThanOrEqual(0);
    expect(out.total_score).toBeLessThanOrEqual(100);
    expect(out.band).toBeDefined();
    expect(out.gate_passed).toBeDefined();
    expect(out.components).toBeDefined();
    expect(out.components.must).toBeGreaterThanOrEqual(0);
    expect(out.components.must).toBeLessThanOrEqual(100);
  });

  describe('skills-list-only candidate should not score 0', () => {
    it('gives meaningful score when skills match but are only in skills list', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: ['Python', 'SQL', 'AWS'],
          nice_to_have_skills: ['Docker'],
          domain: 'data-engineering',
          responsibilities: ['Build data pipelines', 'Maintain ETL processes'],
        }),
        candidateSkills: ['Python', 'SQL', 'AWS', 'Docker'],
        candidateTools: [],
        resumeText: [
          'Skills: Python, SQL, AWS, Docker',
          'Experience',
          'Data Engineer at Acme Corp',
          '- Built scalable data pipelines processing 1M records daily',
          '- Maintained ETL processes reducing latency by 40%',
          '- Managed AWS infrastructure for data warehouse',
        ].join('\n'),
        experience: [{
          company: 'Acme Corp',
          title: 'Data Engineer',
          start_date: '2022-01-01',
          current: true,
          responsibilities: [
            'Built scalable data pipelines processing 1M records daily',
            'Maintained ETL processes reducing latency by 40%',
            'Managed AWS infrastructure for data warehouse',
          ],
        }],
        years_of_experience: 4,
        primary_title: 'Data Engineer',
      });

      const out = computeATSScoreV2(input);
      expect(out.total_score).toBeGreaterThan(40);
      expect(out.gate_passed).toBe(true);
      expect(out.components.must).toBeGreaterThan(30);
    });

    it('scores non-zero even when skills are only in skills list (no bullets)', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: ['React', 'TypeScript', 'Node.js'],
          domain: 'frontend',
        }),
        candidateSkills: ['React', 'TypeScript', 'Node.js', 'CSS'],
        candidateTools: [],
        resumeText: 'Skills: React, TypeScript, Node.js, CSS',
        experience: [],
        primary_title: 'Frontend Developer',
      });

      const out = computeATSScoreV2(input);
      expect(out.total_score).toBeGreaterThan(15);
      expect(out.matched_must.length).toBeGreaterThan(0);
    });
  });

  describe('elite candidate scenario', () => {
    it('scores high for a strong match with bullet evidence', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
          nice_to_have_skills: ['GraphQL', 'Docker', 'AWS'],
          domain: 'fullstack',
          min_years_experience: 3,
          preferred_years_experience: 6,
          responsibilities: [
            'Build and maintain full-stack web applications',
            'Design RESTful APIs and database schemas',
            'Collaborate with product and design teams',
          ],
        }),
        candidateSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'GraphQL', 'Docker', 'AWS'],
        candidateTools: ['VS Code', 'Git', 'Jira'],
        resumeText: [
          'John Doe — john@example.com — linkedin.com/in/johndoe',
          '',
          'Summary',
          'Full-stack developer with 5 years of experience building web applications.',
          '',
          'Technical Skills',
          'React, TypeScript, Node.js, PostgreSQL, GraphQL, Docker, AWS, Git',
          '',
          'Experience',
          'Senior Full-Stack Developer at TechCo — 2021-present',
          '- Built React + TypeScript dashboards serving 50k monthly active users',
          '- Designed and implemented RESTful APIs using Node.js and Express',
          '- Managed PostgreSQL databases with complex query optimizations reducing latency by 60%',
          '- Deployed containerized services using Docker and AWS ECS',
          '- Led migration to GraphQL API reducing frontend-backend round trips by 3x',
          '',
          'Full-Stack Developer at StartupXYZ — 2019-2021',
          '- Developed customer-facing React applications with TypeScript',
          '- Built Node.js microservices handling 10k requests/sec',
          '- Collaborated with product and design teams on feature specifications',
          '',
          'Education',
          'B.S. Computer Science — MIT, 2019',
        ].join('\n'),
        experience: [
          {
            company: 'TechCo',
            title: 'Senior Full-Stack Developer',
            start_date: '2021-06-01',
            current: true,
            responsibilities: [
              'Built React + TypeScript dashboards serving 50k monthly active users',
              'Designed and implemented RESTful APIs using Node.js and Express',
              'Managed PostgreSQL databases with complex query optimizations reducing latency by 60%',
              'Deployed containerized services using Docker and AWS ECS',
              'Led migration to GraphQL API reducing frontend-backend round trips by 3x',
            ],
          },
          {
            company: 'StartupXYZ',
            title: 'Full-Stack Developer',
            start_date: '2019-01-01',
            end_date: '2021-05-31',
            responsibilities: [
              'Developed customer-facing React applications with TypeScript',
              'Built Node.js microservices handling 10k requests/sec',
              'Collaborated with product and design teams on feature specifications',
            ],
          },
        ],
        education: [{ degree: 'B.S.', field: 'Computer Science' }],
        years_of_experience: 5,
        primary_title: 'Senior Full-Stack Developer',
        secondary_titles: ['Full-Stack Developer'],
      });

      const out = computeATSScoreV2(input);
      expect(out.total_score).toBeGreaterThanOrEqual(65);
      expect(out.gate_passed).toBe(true);
      expect(out.band).toMatch(/elite|strong|possible/);
      expect(out.matched_must.length).toBeGreaterThanOrEqual(3);
      expect(out.components.must).toBeGreaterThanOrEqual(50);
      expect(out.components.resp).toBeGreaterThan(30);
    });
  });

  describe('weak candidate scenario', () => {
    it('scores low for a poor match', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: ['Kubernetes', 'Terraform', 'Go', 'Prometheus'],
          domain: 'devops',
          responsibilities: [
            'Manage Kubernetes clusters at scale',
            'Build infrastructure as code with Terraform',
          ],
        }),
        candidateSkills: ['Microsoft Excel', 'PowerPoint', 'Word'],
        resumeText: [
          'Skills: Microsoft Excel, PowerPoint, Word',
          'Experience',
          '- Created Excel spreadsheets for budget tracking',
          '- Prepared PowerPoint presentations for quarterly reviews',
        ].join('\n'),
        experience: [{
          company: 'OfficeCorp',
          title: 'Administrative Assistant',
          start_date: '2020-01-01',
          current: true,
          responsibilities: [
            'Created Excel spreadsheets for budget tracking',
            'Prepared PowerPoint presentations for quarterly reviews',
          ],
        }],
        primary_title: 'Administrative Assistant',
      });

      const out = computeATSScoreV2(input);
      expect(out.total_score).toBeLessThan(40);
      expect(out.gate_passed).toBe(false);
      expect(out.missing_must.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('gate logic', () => {
    it('passes gate when all must-haves are met', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: ['Python', 'SQL'],
        }),
        candidateSkills: ['Python', 'SQL'],
        resumeText: 'Skills: Python, SQL\n- Built Python scripts\n- Wrote SQL queries',
        experience: [{
          company: 'DataCo',
          title: 'Data Analyst',
          start_date: '2022-01-01',
          current: true,
          responsibilities: ['Built Python scripts', 'Wrote SQL queries'],
        }],
      });
      const out = computeATSScoreV2(input);
      expect(out.gate_passed).toBe(true);
    });

    it('passes gate with 1 missing must-have (allowed_missing_must = 1)', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: ['Python', 'SQL', 'Spark'],
        }),
        candidateSkills: ['Python', 'SQL'],
        resumeText: 'Skills: Python, SQL\n- Built Python scripts\n- Wrote SQL queries',
        experience: [{
          company: 'DataCo',
          title: 'Data Analyst',
          start_date: '2022-01-01',
          current: true,
          responsibilities: ['Built Python scripts', 'Wrote SQL queries'],
        }],
      });
      const out = computeATSScoreV2(input);
      expect(out.gate_passed).toBe(true);
      expect(out.missing_must).toContain('spark');
    });

    it('blocks gate with 2+ missing must-haves', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: ['Python', 'SQL', 'Spark', 'Airflow'],
        }),
        candidateSkills: ['Python'],
        resumeText: 'Skills: Python\n- Built Python scripts',
        experience: [{
          company: 'DataCo',
          title: 'Analyst',
          start_date: '2022-01-01',
          current: true,
          responsibilities: ['Built Python scripts'],
        }],
      });
      const out = computeATSScoreV2(input);
      expect(out.gate_passed).toBe(false);
    });
  });

  describe('no must-have skills', () => {
    it('gives C_must = 100 when no must-haves required', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: [],
          nice_to_have_skills: ['Python'],
        }),
        candidateSkills: ['Python'],
        resumeText: 'Skills: Python',
      });
      const out = computeATSScoreV2(input);
      expect(out.components.must).toBe(100);
      expect(out.gate_passed).toBe(true);
    });
  });

  describe('empty input edge cases', () => {
    it('handles completely empty input without crashing', () => {
      const input = makeInput();
      const out = computeATSScoreV2(input);
      expect(out.total_score).toBeGreaterThanOrEqual(0);
      expect(out.total_score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(out.total_score)).toBe(true);
    });

    it('handles empty resume text', () => {
      const input = makeInput({
        requirements: makeRequirements({ must_have_skills: ['Python'] }),
        candidateSkills: ['Python'],
        resumeText: '',
      });
      const out = computeATSScoreV2(input);
      expect(Number.isFinite(out.total_score)).toBe(true);
    });
  });

  describe('scope scoring', () => {
    it('gives full credit for years within the required range', () => {
      const input = makeInput({
        requirements: makeRequirements({
          min_years_experience: 3,
          preferred_years_experience: 6,
        }),
        years_of_experience: 5,
        resumeText: 'Experience\n- Led engineering team\n- Managed cloud infrastructure',
      });
      const out = computeATSScoreV2(input);
      expect(out.components.scope).toBeGreaterThanOrEqual(45);
    });

    it('penalizes under-qualified candidates', () => {
      const withinRange = makeInput({
        requirements: makeRequirements({ min_years_experience: 5, preferred_years_experience: 8 }),
        years_of_experience: 6,
        resumeText: 'Experience section here',
      });
      const underQualified = makeInput({
        requirements: makeRequirements({ min_years_experience: 5, preferred_years_experience: 8 }),
        years_of_experience: 1,
        resumeText: 'Experience section here',
      });
      const inRange = computeATSScoreV2(withinRange);
      const under = computeATSScoreV2(underQualified);
      expect(inRange.components.scope).toBeGreaterThan(under.components.scope);
    });
  });

  describe('score bands', () => {
    it('classifies bands correctly based on total score', () => {
      const out90 = computeATSScoreV2(makeInput());
      expect(['elite', 'strong', 'possible', 'weak']).toContain(out90.band);
    });
  });

  describe('weight sanity', () => {
    it('all weights sum to 1.0', () => {
      const sum = Object.values(W_V2).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    });

    it('no weight is negative', () => {
      for (const [, val] of Object.entries(W_V2)) {
        expect(val).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('confidence', () => {
    it('returns confidence between 0 and 1', () => {
      const input = makeInput({
        requirements: makeRequirements({ must_have_skills: ['Python'] }),
        candidateSkills: ['Python'],
        resumeText: 'Skills: Python\n- Built Python apps',
        experience: [{
          company: 'Co',
          title: 'Dev',
          start_date: '2022-01-01',
          current: true,
          responsibilities: ['Built Python apps'],
        }],
      });
      const out = computeATSScoreV2(input);
      expect(out.confidence).toBeGreaterThanOrEqual(0);
      expect(out.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('negative signals', () => {
    it('detects job hopping', () => {
      const input = makeInput({
        experience: [
          { company: 'A', title: 'Dev', start_date: '2023-01-01', end_date: '2023-06-01', responsibilities: ['Work'] },
          { company: 'B', title: 'Dev', start_date: '2023-07-01', end_date: '2023-12-01', responsibilities: ['Work'] },
          { company: 'C', title: 'Dev', start_date: '2024-01-01', end_date: '2024-06-01', responsibilities: ['Work'] },
          { company: 'D', title: 'Dev', start_date: '2024-07-01', end_date: '2024-12-01', responsibilities: ['Work'] },
          { company: 'E', title: 'Dev', start_date: '2025-01-01', current: true, responsibilities: ['Work'] },
        ],
        resumeText: 'Work experience across 5 companies in 2 years',
      });
      const out = computeATSScoreV2(input);
      const jobHop = out.negative_signals?.find(s => s.type === 'job_hopping');
      expect(jobHop).toBeDefined();
    });
  });

  describe('NaN guard — invalid dates must not collapse score to 0', () => {
    it('produces non-zero score even with invalid date strings in experience', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: ['Python'],
          domain: 'software-engineering',
        }),
        candidateSkills: ['Python', 'SQL'],
        resumeText: 'Skills: Python, SQL\nExperience\n- Built Python apps\n- Wrote SQL queries',
        experience: [
          {
            company: 'GoodCo',
            title: 'Developer',
            start_date: '2022-01-01',
            end_date: 'INVALID-DATE',
            responsibilities: ['Built Python apps'],
          },
          {
            company: 'BadCo',
            title: 'Dev',
            start_date: 'not-a-date',
            end_date: '2023-06-01',
            responsibilities: ['Wrote SQL queries'],
          },
        ],
        primary_title: 'Software Developer',
      });
      const out = computeATSScoreV2(input);
      expect(out.total_score).toBeGreaterThan(0);
      expect(Number.isFinite(out.total_score)).toBe(true);
      expect(Number.isFinite(out.components.risk)).toBe(true);
    });

    it('handles completely missing dates gracefully', () => {
      const input = makeInput({
        candidateSkills: ['React'],
        resumeText: 'Skills: React\n- Built dashboards',
        experience: [
          { company: 'Co', title: 'Dev', responsibilities: ['Built dashboards'] },
        ],
        primary_title: 'Developer',
      });
      const out = computeATSScoreV2(input);
      expect(out.total_score).toBeGreaterThan(0);
      expect(Number.isFinite(out.total_score)).toBe(true);
    });
  });

  describe('safeDate', () => {
    it('returns Date for valid strings', () => {
      expect(safeDate('2023-01-15')).toBeInstanceOf(Date);
      expect(safeDate('2023-01-15')!.getFullYear()).toBe(2023);
    });
    it('returns null for invalid strings', () => {
      expect(safeDate('INVALID')).toBeNull();
      expect(safeDate('not-a-date')).toBeNull();
    });
    it('returns null for empty/undefined', () => {
      expect(safeDate('')).toBeNull();
      expect(safeDate(undefined)).toBeNull();
      expect(safeDate(null)).toBeNull();
    });
  });

  describe('job with 0 must-haves should still score > 0', () => {
    it('gives non-zero total when requirements are empty', () => {
      const input = makeInput({
        requirements: makeRequirements({
          must_have_skills: [],
          nice_to_have_skills: [],
          responsibilities: [],
          domain: 'qa',
        }),
        candidateSkills: ['Selenium', 'JIRA', 'SQL'],
        resumeText: [
          'Skills: Selenium, JIRA, SQL',
          'Experience',
          'QA Analyst at TestCorp — 2020-present',
          '- Automated regression tests using Selenium reducing manual effort by 60%',
          '- Managed defect tracking in JIRA for 3 product teams',
        ].join('\n'),
        experience: [{
          company: 'TestCorp',
          title: 'QA Analyst',
          start_date: '2020-01-01',
          current: true,
          responsibilities: [
            'Automated regression tests using Selenium reducing manual effort by 60%',
            'Managed defect tracking in JIRA for 3 product teams',
          ],
        }],
        years_of_experience: 5,
        primary_title: 'QA Analyst',
      });
      const out = computeATSScoreV2(input);
      expect(out.total_score).toBeGreaterThan(50);
      expect(out.gate_passed).toBe(true);
      expect(out.components.must).toBe(100);
      expect(out.components.resp).toBe(100);
    });
  });
});
