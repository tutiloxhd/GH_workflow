// El email identifica la cuenta sin distinguir mayúsculas ni espacios accidentales.
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
