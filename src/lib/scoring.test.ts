import { describe, it, expect } from 'vitest';
import { calculateMatchScore } from './scoring';

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

// ATS scoring is now handled by the v3 engine in src/lib/ats/.
