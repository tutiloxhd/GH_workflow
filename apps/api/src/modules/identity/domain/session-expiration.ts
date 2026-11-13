const MILLISECONDS_PER_HOUR = 3_600_000;

// Sesiones de duración fija: no se renuevan con el uso.
export const sessionExpiresAt = (createdAt: Date, ttlHours: number): Date =>
  new Date(createdAt.getTime() + ttlHours * MILLISECONDS_PER_HOUR);

export const isSessionActive = (
  session: { readonly expiresAt: Date; readonly revokedAt: Date | null },
  now: Date,
): boolean => session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
