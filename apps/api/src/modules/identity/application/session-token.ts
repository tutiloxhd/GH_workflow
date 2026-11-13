import { createHash, randomBytes } from 'node:crypto';

const SESSION_TOKEN_BYTES = 32;

// El token viaja solo en la cookie; en la base se guarda únicamente su hash.
export const generateSessionToken = (): string =>
  randomBytes(SESSION_TOKEN_BYTES).toString('base64url');

export const hashSessionToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
