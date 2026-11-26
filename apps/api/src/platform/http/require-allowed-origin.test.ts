import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireAllowedOrigin } from './require-allowed-origin.js';

describe('requireAllowedOrigin', () => {
  const allowedOrigins = ['http://localhost:4200', 'https://synthetic.devtunnels.ms'] as const;

  it('accepts either configured origin and rejects other write origins', () => {
    const handler = requireAllowedOrigin(allowedOrigins);
    const check = (origin: string) => {
      const next = vi.fn();
      const statusSpy = vi.fn().mockReturnThis();
      const response = {
        locals: {},
        status: statusSpy,
        type: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      } as unknown as Response;
      const request = { method: 'POST', get: () => origin } as unknown as Request;
      handler(request, response, next);
      return { next, statusSpy };
    };

    expect(check(allowedOrigins[0]).next).toHaveBeenCalledOnce();
    expect(check(allowedOrigins[1]).next).toHaveBeenCalledOnce();
    const rejected = check('https://other.example');
    expect(rejected.next).not.toHaveBeenCalled();
    expect(rejected.statusSpy).toHaveBeenCalledWith(403);
  });
});
