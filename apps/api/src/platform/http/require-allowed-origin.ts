import type { RequestHandler } from 'express';
import { PROBLEMS, sendProblem } from './problem-details.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Protección CSRF: una operación que cambia estado solo se acepta si el navegador declara
// venir del frontend propio. Complementa la cookie de sesión SameSite=Lax.
export function requireAllowedOrigin(allowedOrigin: string | readonly string[]): RequestHandler {
  const allowedOrigins = new Set(typeof allowedOrigin === 'string' ? [allowedOrigin] : allowedOrigin);
  return (request, response, next) => {
    if (SAFE_METHODS.has(request.method) || allowedOrigins.has(request.get('origin') ?? '')) {
      next();
      return;
    }
    sendProblem(response, PROBLEMS.originNotAllowed);
  };
}
