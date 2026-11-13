import { describe, expect, it } from 'vitest';
import { InvalidEnvError, parseEnv } from './env.js';

const validSource = {
  NODE_ENV: 'development',
  PORT: '3000',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_NAME: 'workflow',
  DB_USER: 'workflow_app',
  DB_PASSWORD: 'synthetic-password',
  ADMIN_NEW_DB_NAME: 'admin_new',
  WEB_ORIGIN: 'http://localhost:4200',
};

function captureEnvError(source: Record<string, string | undefined>): InvalidEnvError {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof InvalidEnvError) return error;
  }
  throw new Error('Se esperaba InvalidEnvError');
}

describe('parseEnv', () => {
  it('acepta un entorno completo, convierte números y aplica la duración de sesión por defecto', () => {
    const env = parseEnv(validSource);

    expect(env.PORT).toBe(3000);
    expect(env.DB_PORT).toBe(3306);
    expect(env.SESSION_TTL_HOURS).toBe(8);
  });

  it('rechaza un entorno incompleto e informa solo los nombres de las variables', () => {
    const { DB_PASSWORD: _omitted, ...sourceWithoutPassword } = validSource;

    const error = captureEnvError({ ...sourceWithoutPassword, PORT: 'no-es-un-puerto' });

    expect(error.variableNames).toEqual(['PORT', 'DB_PASSWORD']);
    expect(error.message).not.toContain('no-es-un-puerto');
  });

  it('rechaza nombres de base con caracteres que no son seguros como identificador', () => {
    expect(captureEnvError({ ...validSource, DB_NAME: 'workflow`; DROP' }).variableNames).toEqual([
      'DB_NAME',
    ]);
  });

  it('exige que WEB_ORIGIN sea un origen exacto, sin ruta ni barra final', () => {
    expect(
      captureEnvError({ ...validSource, WEB_ORIGIN: 'http://localhost:4200/app' }).variableNames,
    ).toEqual(['WEB_ORIGIN']);
  });

  it('limita la duración de la sesión a 24 horas', () => {
    expect(captureEnvError({ ...validSource, SESSION_TTL_HOURS: '48' }).variableNames).toEqual([
      'SESSION_TTL_HOURS',
    ]);
  });
});
