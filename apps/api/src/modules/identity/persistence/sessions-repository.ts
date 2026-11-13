import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import { userSessions, users } from '../../../platform/database/schema/identity.schema.js';
import type { UserStatus } from '../domain/user-status.js';

export interface StoredSession {
  readonly sessionId: number;
  readonly userId: number;
  readonly userStatus: UserStatus;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export async function insertSession(
  executor: DatabaseExecutor,
  session: { userId: number; tokenHash: string; createdAt: Date; expiresAt: Date },
): Promise<void> {
  await executor.insert(userSessions).values(session);
}

export async function findSessionByTokenHash(
  executor: DatabaseExecutor,
  tokenHash: string,
): Promise<StoredSession | undefined> {
  const [session] = await executor
    .select({
      sessionId: userSessions.id,
      userId: userSessions.userId,
      userStatus: users.status,
      expiresAt: userSessions.expiresAt,
      revokedAt: userSessions.revokedAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(eq(userSessions.tokenHash, tokenHash))
    .limit(1);
  return session;
}

export async function revokeSessionByTokenHash(
  executor: DatabaseExecutor,
  tokenHash: string,
  revokedAt: Date,
): Promise<void> {
  await executor
    .update(userSessions)
    .set({ revokedAt })
    .where(and(eq(userSessions.tokenHash, tokenHash), isNull(userSessions.revokedAt)));
}

export async function revokeAllSessionsOfUser(
  executor: DatabaseExecutor,
  userId: number,
  revokedAt: Date,
): Promise<void> {
  await executor
    .update(userSessions)
    .set({ revokedAt })
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
}
