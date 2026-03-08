import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  handleAPIError,
} from '@/lib/errors';

describe('errors', () => {
  describe('AppError', () => {
    it('sets message and statusCode', () => {
      const err = new AppError('Bad', 400);
      expect(err.message).toBe('Bad');
      expect(err.statusCode).toBe(400);
      expect(err.name).toBe('AppError');
    });
  });

  describe('ValidationError', () => {
    it('has status 400 and code VALIDATION_ERROR', () => {
      const err = new ValidationError('Invalid input', { field: 'email' });
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toEqual({ field: 'email' });
    });
  });

  describe('NotFoundError', () => {
    it('formats resource not found', () => {
      const err = new NotFoundError('Job');
      expect(err.message).toBe('Job not found');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
    });
  });

  describe('AuthenticationError', () => {
    it('defaults to 401', () => {
      const err = new AuthenticationError();
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Authentication required');
    });
  });

  describe('handleAPIError', () => {
    it('returns JSON response for AppError', async () => {
      const err = new ValidationError('Bad email');
      const res = handleAPIError(err);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toEqual({
        message: 'Bad email',
        code: 'VALIDATION_ERROR',
        details: undefined,
      });
    });

    it('returns 500 for generic Error', async () => {
      const res = handleAPIError(new Error('Unexpected'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error?.code).toBe('INTERNAL_ERROR');
      expect(body.error?.message).toBe('Internal server error');
    });

    it('returns 500 for unknown', async () => {
      const res = handleAPIError('string error');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error?.code).toBe('UNKNOWN_ERROR');
    });
  });
});
