import { Router } from 'express';
import { z } from 'zod';
import { sendProblem, sendValidationProblem } from '../../../platform/http/problem-details.js';
import { logIn, logOut } from '../application/authentication.js';
import type { IdentityDependencies } from '../application/identity-dependencies.js';
import { getCurrentUser, requireSession } from './authorization.js';
import { IDENTITY_PROBLEMS } from './identity-problems.js';
import {
  clearSessionCookie,
  readSessionToken,
  writeSessionCookie,
  type SessionCookieSettings,
} from './session-cookie.js';
import { toUserResponse } from './user-response.js';

// Límites amplios: solo evitan cargas abusivas; la política se aplica al crear la contraseña.
const logInBodySchema = z.strictObject({
  email: z.string().trim().min(1).max(190),
  password: z.string().min(1).max(200),
});

export function createAuthRouter(
  dependencies: IdentityDependencies,
  cookieSettings: SessionCookieSettings,
): Router {
  const router = Router();

  router.post('/login', async (request, response) => {
    const body = logInBodySchema.safeParse(request.body);
    if (!body.success) {
      sendValidationProblem(response, body.error);
      return;
    }

    const outcome = await logIn(dependencies, body.data);
    if (!outcome.isSuccess) {
      sendProblem(response, IDENTITY_PROBLEMS[outcome.failure]);
      return;
    }

    writeSessionCookie(response, cookieSettings, outcome.value);
    response.json({ user: toUserResponse(outcome.value.user) });
  });

  router.post('/logout', requireSession(dependencies), async (request, response) => {
    const token = readSessionToken(request);
    if (token) await logOut(dependencies, token);
    clearSessionCookie(response, cookieSettings);
    response.status(204).end();
  });

  router.get('/me', requireSession(dependencies), (_request, response) => {
    response.json({ user: toUserResponse(getCurrentUser(response)) });
  });

  return router;
}
