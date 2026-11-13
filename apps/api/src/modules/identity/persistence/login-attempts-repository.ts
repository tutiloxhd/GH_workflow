import { and, count, desc, eq, gt } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import { loginAttempts } from '../../../platform/database/schema/identity.schema.js';

export async function recordLoginAttempt(
  executor: DatabaseExecutor,
  attempt: { email: string; succeeded: boolean; attemptedAt: Date },
): Promise<void> {
  await executor.insert(loginAttempts).values(attempt);
}

// Fallos posteriores a `since` y al último acceso exitoso del mismo email.
export async function countFailuresSinceLastSuccess(
  executor: DatabaseExecutor,
  email: string,
  since: Date,
): Promise<number> {
  const [lastSuccess] = await executor
    .select({ attemptedAt: loginAttempts.attemptedAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, true)))
    .orderBy(desc(loginAttempts.attemptedAt))
    .limit(1);

  const lowerBound =
    lastSuccess && lastSuccess.attemptedAt.getTime() > since.getTime()
      ? lastSuccess.attemptedAt
      : since;

  const [row] = await executor
    .select({ failures: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.succeeded, false),
        gt(loginAttempts.attemptedAt, lowerBound),
      ),
    );
  return row?.failures ?? 0;
}
