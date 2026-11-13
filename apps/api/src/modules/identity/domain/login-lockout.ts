// Bloqueo por fuerza bruta: con MAX fallos dentro de la ventana, se rechazan nuevos intentos.
// Mientras dura el bloqueo los intentos no se registran, así que se libera cuando el fallo
// más antiguo de la ventana sale de ella.
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_WINDOW_MINUTES = 15;

const MILLISECONDS_PER_MINUTE = 60_000;

export const lockoutWindowStart = (now: Date): Date =>
  new Date(now.getTime() - LOGIN_LOCKOUT_WINDOW_MINUTES * MILLISECONDS_PER_MINUTE);

// recentFailureCount: fallos posteriores a lockoutWindowStart(now) y al último acceso exitoso.
export const isLoginLocked = (recentFailureCount: number): boolean =>
  recentFailureCount >= MAX_FAILED_LOGIN_ATTEMPTS;
