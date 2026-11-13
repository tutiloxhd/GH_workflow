import { fail, succeed, type Result } from '../../../platform/result.js';
import { normalizeEmail } from '../domain/email.js';
import { isLoginLocked, lockoutWindowStart } from '../domain/login-lockout.js';
import { isSessionActive, sessionExpiresAt } from '../domain/session-expiration.js';
import { isAllowedToSignIn } from '../domain/user-status.js';
import {
  countFailuresSinceLastSuccess,
  recordLoginAttempt,
} from '../persistence/login-attempts-repository.js';
import {
  findSessionByTokenHash,
  insertSession,
  revokeSessionByTokenHash,
} from '../persistence/sessions-repository.js';
import {
  findUserAccountById,
  findUserCredentialsByEmail,
  type UserAccount,
} from '../persistence/users-repository.js';
import type { IdentityDependencies } from './identity-dependencies.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

export type LogInFailure = 'INVALID_CREDENTIALS' | 'LOGIN_TEMPORARILY_LOCKED';

export interface StartedSession {
  readonly token: string;
  readonly expiresAt: Date;
  readonly user: UserAccount;
}

// Hash de referencia para comparar cuando el email no existe, de modo que la respuesta tarde
// lo mismo y no revele qué cuentas existen.
const unknownUserHashes = new WeakMap<IdentityDependencies['passwordHasher'], Promise<string>>();

function referenceHashFor(dependencies: IdentityDependencies): Promise<string> {
  const { passwordHasher } = dependencies;
  let referenceHash = unknownUserHashes.get(passwordHasher);
  if (!referenceHash) {
    referenceHash = passwordHasher.hash('Referencia-sin-cuenta-0');
    unknownUserHashes.set(passwordHasher, referenceHash);
  }
  return referenceHash;
}

export async function logIn(
  dependencies: IdentityDependencies,
  credentials: { email: string; password: string },
): Promise<Result<StartedSession, LogInFailure>> {
  const { db } = dependencies.database;
  const email = normalizeEmail(credentials.email);
  const now = dependencies.clock.now();

  const recentFailures = await countFailuresSinceLastSuccess(db, email, lockoutWindowStart(now));
  if (isLoginLocked(recentFailures)) return fail('LOGIN_TEMPORARILY_LOCKED');

  const user = await findUserCredentialsByEmail(db, email);
  const passwordMatches = await dependencies.passwordHasher.matches(
    credentials.password,
    user?.passwordHash ?? (await referenceHashFor(dependencies)),
  );

  if (!user || !passwordMatches || !isAllowedToSignIn(user.status)) {
    await recordLoginAttempt(db, { email, succeeded: false, attemptedAt: now });
    return fail('INVALID_CREDENTIALS');
  }

  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt(now, dependencies.sessionTtlHours);
  const account = await db.transaction(async (transaction) => {
    await insertSession(transaction, {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      createdAt: now,
      expiresAt,
    });
    await recordLoginAttempt(transaction, { email, succeeded: true, attemptedAt: now });
    return findUserAccountById(transaction, user.id);
  });
  if (!account) throw new Error('El usuario autenticado desapareció durante el inicio de sesión');

  return succeed({ token, expiresAt, user: account });
}

export async function logOut(dependencies: IdentityDependencies, token: string): Promise<void> {
  await revokeSessionByTokenHash(
    dependencies.database.db,
    hashSessionToken(token),
    dependencies.clock.now(),
  );
}

// Devuelve el usuario de una sesión vigente, o undefined si el token no sirve.
export async function authenticateSession(
  dependencies: IdentityDependencies,
  token: string,
): Promise<UserAccount | undefined> {
  const { db } = dependencies.database;
  const session = await findSessionByTokenHash(db, hashSessionToken(token));
  if (!session) return undefined;
  if (!isSessionActive(session, dependencies.clock.now())) return undefined;
  if (!isAllowedToSignIn(session.userStatus)) return undefined;
  return findUserAccountById(db, session.userId);
}
