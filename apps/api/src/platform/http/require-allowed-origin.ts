import type { RequestHandler } from 'express';
import { PROBLEMS, sendProblem } from './problem-details.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Protección CSRF: una operación que cambia estado solo se acepta si el navegador declara
// venir del frontend propio. Complementa la cookie de sesión SameSite=Lax.
export function requireAllowedOrigin(allowedOrigin: string): RequestHandler {
  return (request, response, next) => {
    if (SAFE_METHODS.has(request.method) || request.get('origin') === allowedOrigin) {
      next();
      return;
    }
    sendProblem(response, PROBLEMS.originNotAllowed);
  };
}
