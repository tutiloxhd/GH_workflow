import type { RequestHandler, Response } from 'express';
import { PROBLEMS, sendProblem } from '../../../platform/http/problem-details.js';
import { authenticateSession } from '../application/authentication.js';
import type { IdentityDependencies } from '../application/identity-dependencies.js';
import type { RoleCode } from '../domain/role-code.js';
import type { UserAccount } from '../persistence/users-repository.js';
import { readSessionToken } from './session-cookie.js';

const CURRENT_USER_KEY = 'currentUser';

// Solo es válido después de requireSession; si no, es un error de programación.
export function getCurrentUser(response: Response): UserAccount {
  const user = response.locals[CURRENT_USER_KEY] as UserAccount | undefined;
  if (!user) throw new Error('getCurrentUser se usó en una ruta sin requireSession');
  return user;
}

export function requireSession(dependencies: IdentityDependencies): RequestHandler {
  return async (request, response, next) => {
    const token = readSessionToken(request);
    const user = token ? await authenticateSession(dependencies, token) : undefined;
    if (!user) {
      sendProblem(response, PROBLEMS.authenticationRequired);
      return;
    }
    response.locals[CURRENT_USER_KEY] = user;
    next();
  };
}

export function requireRole(role: RoleCode): RequestHandler {
  return (_request, response, next) => {
    if (!getCurrentUser(response).roles.includes(role)) {
      sendProblem(response, PROBLEMS.forbidden);
      return;
    }
    next();
  };
}
