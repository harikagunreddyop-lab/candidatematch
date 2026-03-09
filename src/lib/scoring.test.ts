import { describe, it, expect } from 'vitest';
import { calculateMatchScore, calculateATSScore } from './scoring';

describe('Match Scoring', () => {
  it('should calculate skill match correctly', () => {
    const candidate = {
      skills: ['React', 'TypeScript', 'Node.js'],
    };
    const job = {
      title: 'Frontend Engineer',
      must_have_skills: ['React', 'TypeScript'],
      nice_to_have_skills: ['Node.js'],
    };

    const { score } = calculateMatchScore(candidate, job);
    expect(score).toBeGreaterThan(80);
  });

  it('should penalize missing critical skills', () => {
    const candidate = {
      skills: ['HTML', 'CSS'],
    };
    const job = {
      title: 'Full Stack Engineer',
      must_have_skills: ['React', 'TypeScript', 'Node.js'],
    };

    const { score } = calculateMatchScore(candidate, job);
    expect(score).toBeLessThan(50);
  });

  it('should return reasons array', () => {
    const candidate = {
      skills: ['React', 'TypeScript'],
      years_of_experience: 5,
      open_to_remote: true,
    };
    const job = {
      title: 'React Developer',
      must_have_skills: ['React', 'TypeScript'],
      remote_type: 'remote',
    };

    const { score, reasons } = calculateMatchScore(candidate, job);
    expect(score).toBeGreaterThan(0);
    expect(Array.isArray(reasons)).toBe(true);
  });
});

describe('ATS Scoring', () => {
  it('should detect ATS-friendly formatting', () => {
    const resume = {
      text: [
        'John Doe — john@example.com — 555-123-4567 — linkedin.com/in/johndoe',
        '',
        'Summary',
        'Software Engineer with 5 years experience in React and TypeScript. Built scalable web apps. Achieved 40% improvement in load times.',
        '',
        'Experience',
        'Senior Developer at Acme Corp — 2020–present',
        '- Built React and TypeScript applications serving 50k users',
        '- Led migration to Node.js backend; reduced latency by 30%',
        '- Implemented REST APIs and improved test coverage',
        '- Collaborated with product and design teams',
        '',
        'Developer at Startup Inc — 2018–2020',
        '- Developed customer-facing React applications',
        '- Delivered 3 major features on schedule',
        '',
        'Education',
        'B.S. Computer Science — State University, 2018',
        '',
        'Skills',
        'React, TypeScript, Node.js, PostgreSQL, Git, AWS',
      ].join('\n'),
      formatting: { has_complex_tables: false, uses_images: false },
    };

    const score = calculateATSScore(resume);
    expect(score).toBeGreaterThan(70);
  });

  it('should penalize complex tables and images', () => {
    const baseText =
      'Software Engineer with 5 years experience. Experience section. Skills: React. john@example.com 555-123-4567';
    const withoutPenalty = calculateATSScore({
      text: baseText,
      formatting: { has_complex_tables: false, uses_images: false },
    });
    const withTables = calculateATSScore({
      text: baseText,
      formatting: { has_complex_tables: true, uses_images: false },
    });
    const withImages = calculateATSScore({
      text: baseText,
      formatting: { has_complex_tables: false, uses_images: true },
    });

    expect(withTables).toBeLessThan(withoutPenalty);
    expect(withImages).toBeLessThan(withoutPenalty);
  });

  it('should return a number between 0 and 100', () => {
    const resume = {
      text: 'Minimal resume.',
      formatting: {},
    };
    const score = calculateATSScore(resume);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
