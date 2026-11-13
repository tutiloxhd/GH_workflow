import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email.js';
import { isLoginLocked, lockoutWindowStart, MAX_FAILED_LOGIN_ATTEMPTS } from './login-lockout.js';
import { findPasswordPolicyViolations } from './password-policy.js';
import { isSessionActive, sessionExpiresAt } from './session-expiration.js';

describe('política de contraseñas', () => {
  it('acepta 8 caracteres con una mayúscula y un número', () => {
    expect(findPasswordPolicyViolations('Remate12')).toEqual([]);
  });

  it.each([
    ['Remate1', ['TOO_SHORT']],
    ['remate123', ['MISSING_UPPERCASE']],
    ['Rematesss', ['MISSING_DIGIT']],
    ['abc', ['TOO_SHORT', 'MISSING_UPPERCASE', 'MISSING_DIGIT']],
  ])('"%s" incumple %j', (password, expected) => {
    expect(findPasswordPolicyViolations(password)).toEqual(expected);
  });

  it('cuenta caracteres y no bytes para el mínimo, y bytes para el máximo de bcrypt', () => {
    expect(findPasswordPolicyViolations('Ñandú1áé')).toEqual([]);
    expect(findPasswordPolicyViolations(`A1${'x'.repeat(70)}`)).toEqual([]);
    expect(findPasswordPolicyViolations(`A1${'x'.repeat(71)}`)).toEqual(['TOO_LONG']);
  });
});

describe('normalizeEmail', () => {
  it('quita espacios y pasa a minúsculas', () => {
    expect(normalizeEmail('  Maria.Gonzalez@Example.TEST ')).toBe('maria.gonzalez@example.test');
  });
});

describe('bloqueo de inicio de sesión', () => {
  it('bloquea desde el quinto fallo dentro de la ventana', () => {
    expect(isLoginLocked(MAX_FAILED_LOGIN_ATTEMPTS - 1)).toBe(false);
    expect(isLoginLocked(MAX_FAILED_LOGIN_ATTEMPTS)).toBe(true);
  });

  it('la ventana abarca los últimos 15 minutos', () => {
    const now = new Date('2026-11-12T15:00:00.000Z');
    expect(lockoutWindowStart(now).toISOString()).toBe('2026-11-12T14:45:00.000Z');
  });
});

describe('expiración de sesión', () => {
  const createdAt = new Date('2026-11-12T12:00:00.000Z');

  it('vence a las horas configuradas', () => {
    expect(sessionExpiresAt(createdAt, 8).toISOString()).toBe('2026-11-12T20:00:00.000Z');
  });

  it('una sesión revocada o vencida no está activa', () => {
    const expiresAt = sessionExpiresAt(createdAt, 8);
    const beforeExpiry = new Date('2026-11-12T19:59:59.000Z');

    expect(isSessionActive({ expiresAt, revokedAt: null }, beforeExpiry)).toBe(true);
    expect(isSessionActive({ expiresAt, revokedAt: null }, expiresAt)).toBe(false);
    expect(isSessionActive({ expiresAt, revokedAt: createdAt }, beforeExpiry)).toBe(false);
  });
});
