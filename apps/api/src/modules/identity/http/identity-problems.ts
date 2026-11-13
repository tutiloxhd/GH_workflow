import type { Problem } from '../../../platform/http/problem-details.js';

export const IDENTITY_PROBLEMS = {
  INVALID_CREDENTIALS: {
    status: 401,
    code: 'INVALID_CREDENTIALS',
    title: 'Email o contraseña incorrectos',
  },
  LOGIN_TEMPORARILY_LOCKED: {
    status: 429,
    code: 'LOGIN_TEMPORARILY_LOCKED',
    title: 'Demasiados intentos fallidos. Vuelve a intentarlo en unos minutos',
  },
  EMAIL_ALREADY_REGISTERED: {
    status: 409,
    code: 'EMAIL_ALREADY_REGISTERED',
    title: 'Ya existe un usuario con ese email',
  },
  PASSWORD_POLICY_VIOLATION: {
    status: 400,
    code: 'PASSWORD_POLICY_VIOLATION',
    title: 'La contraseña no cumple la política',
  },
  USER_NOT_FOUND: { status: 404, code: 'USER_NOT_FOUND', title: 'El usuario no existe' },
  CANNOT_CHANGE_OWN_ADMIN_ACCESS: {
    status: 409,
    code: 'CANNOT_CHANGE_OWN_ADMIN_ACCESS',
    title: 'No puedes quitarte el acceso de administrador ni desactivar tu propia cuenta',
  },
  LAST_ADMIN_REQUIRED: {
    status: 409,
    code: 'LAST_ADMIN_REQUIRED',
    title: 'Debe quedar al menos un administrador activo',
  },
} as const satisfies Record<string, Problem>;
