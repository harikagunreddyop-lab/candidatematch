import { describe, it, expect } from 'vitest';
import { candidateCreateSchema } from '@/lib/validation/schemas';

describe('Candidate Validation', () => {
  it('should validate correct candidate data', () => {
    const validData = {
      full_name: 'John Doe',
      email: 'john@example.com',
      phone: '+14155551234',
    };
    const result = candidateCreateSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const invalidData = {
      full_name: 'John Doe',
      email: 'not-an-email',
    };
    const result = candidateCreateSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const invalidData = {
      phone: '+14155551234',
    };
    const result = candidateCreateSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should accept optional phone', () => {
    const validData = {
      full_name: 'Jane Doe',
      email: 'jane@example.com',
    };
    const result = candidateCreateSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});
