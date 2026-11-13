// Política de contraseñas aprobada para el MVP.
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignora lo que excede 72 bytes: se rechaza para que la contraseña no se trunque en silencio.
export const PASSWORD_MAX_BYTES = 72;

export type PasswordPolicyViolation =
  'TOO_SHORT' | 'TOO_LONG' | 'MISSING_UPPERCASE' | 'MISSING_DIGIT';

const UPPERCASE_LETTER = /\p{Lu}/u;
const DIGIT = /\p{Nd}/u;

export function findPasswordPolicyViolations(password: string): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  // Se cuentan puntos de código, no unidades UTF-16: «Ñandú» mide 5.
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) violations.push('TOO_SHORT');
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) violations.push('TOO_LONG');
  if (!UPPERCASE_LETTER.test(password)) violations.push('MISSING_UPPERCASE');
  if (!DIGIT.test(password)) violations.push('MISSING_DIGIT');
  return violations;
}
