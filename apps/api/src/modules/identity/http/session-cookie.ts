import type { Request, Response } from 'express';
import { readCookie } from '../../../platform/http/cookies.js';

export const SESSION_COOKIE_NAME = 'gh_session';
// La cookie solo viaja a la API, no a los archivos del frontend.
const SESSION_COOKIE_PATH = '/api';

export interface SessionCookieSettings {
  // false solo en desarrollo local por HTTP.
  readonly isSecure: boolean;
}

export const readSessionToken = (request: Request): string | undefined =>
  readCookie(request.get('cookie'), SESSION_COOKIE_NAME);

export function writeSessionCookie(
  response: Response,
  settings: SessionCookieSettings,
  session: { token: string; expiresAt: Date },
): void {
  response.cookie(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: settings.isSecure,
    sameSite: 'lax',
    path: SESSION_COOKIE_PATH,
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(response: Response, settings: SessionCookieSettings): void {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: settings.isSecure,
    sameSite: 'lax',
    path: SESSION_COOKIE_PATH,
  });
}
