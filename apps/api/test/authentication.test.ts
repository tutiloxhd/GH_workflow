import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILED_LOGIN_ATTEMPTS } from '../src/modules/identity/domain/login-lockout.js';
import {
  callApi,
  givenUser,
  logInAs,
  resetIdentityTables,
  startIdentityTestContext,
  SYNTHETIC_PASSWORD,
  type IdentityTestContext,
} from './identity-test-harness.js';

const MANAGER_EMAIL = 'gestor@example.test';

describe('autenticación', () => {
  let context: IdentityTestContext;

  beforeAll(async () => {
    context = await startIdentityTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetIdentityTables(context);
    await givenUser(context, { email: MANAGER_EMAIL, roles: ['MANAGER'] });
  });

  const logIn = (email: string, password: string) =>
    callApi(context, 'POST', '/api/auth/login', { body: { email, password } });

  it('un login correcto emite una cookie HttpOnly y SameSite=Lax limitada a /api', async () => {
    const response = await logIn('  GESTOR@example.test ', SYNTHETIC_PASSWORD);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      user: { email: MANAGER_EMAIL, roles: ['MANAGER'], status: 'ACTIVE' },
    });
    expect(response.setCookie).toMatch(/^gh_session=[\w-]{43};/);
    expect(response.setCookie).toContain('HttpOnly');
    expect(response.setCookie).toContain('SameSite=Lax');
    expect(response.setCookie).toContain('Path=/api');
    expect(response.rawBody).not.toMatch(/password/i);
  });

  it('el token no se guarda en claro: la base solo tiene su hash', async () => {
    const cookie = await logInAs(context, MANAGER_EMAIL);
    const token = cookie.split('=')[1];

    const [rows] = await context.database.pool.query('SELECT token_hash FROM user_sessions');
    const [session] = rows as { token_hash: string }[];

    expect(session?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(session?.token_hash).not.toBe(token);
  });

  it('contraseña errónea, email inexistente y cuenta inactiva responden lo mismo', async () => {
    await givenUser(context, { email: 'inactivo@example.test', roles: ['BIDDER'] });
    await context.database.pool.query(
      "UPDATE users SET status = 'INACTIVE' WHERE email = 'inactivo@example.test'",
    );

    const responses = await Promise.all([
      logIn(MANAGER_EMAIL, 'Incorrecta123'),
      logIn('nadie@example.test', SYNTHETIC_PASSWORD),
      logIn('inactivo@example.test', SYNTHETIC_PASSWORD),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(response.setCookie).toBeNull();
    }
  });

  it('bloquea tras 5 fallos en 15 minutos y libera cuando sale el fallo más antiguo', async () => {
    for (let attempt = 0; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt++) {
      expect((await logIn(MANAGER_EMAIL, 'Incorrecta123')).status).toBe(401);
      context.clock.advanceMinutes(1);
    }

    const lockedWithRightPassword = await logIn(MANAGER_EMAIL, SYNTHETIC_PASSWORD);
    expect(lockedWithRightPassword.status).toBe(429);
    expect(lockedWithRightPassword.body).toMatchObject({ code: 'LOGIN_TEMPORARILY_LOCKED' });

    context.clock.advanceMinutes(11);
    expect((await logIn(MANAGER_EMAIL, SYNTHETIC_PASSWORD)).status).toBe(200);
  });

  it('un login exitoso reinicia el conteo de fallos', async () => {
    for (let attempt = 0; attempt < MAX_FAILED_LOGIN_ATTEMPTS - 1; attempt++) {
      await logIn(MANAGER_EMAIL, 'Incorrecta123');
    }
    context.clock.advanceMinutes(1);
    expect((await logIn(MANAGER_EMAIL, SYNTHETIC_PASSWORD)).status).toBe(200);

    context.clock.advanceMinutes(1);
    await logIn(MANAGER_EMAIL, 'Incorrecta123');
    expect((await logIn(MANAGER_EMAIL, SYNTHETIC_PASSWORD)).status).toBe(200);
  });

  it('GET /api/auth/me devuelve el usuario de la sesión y 401 sin cookie', async () => {
    const cookie = await logInAs(context, MANAGER_EMAIL);

    expect(await callApi(context, 'GET', '/api/auth/me', { sessionCookie: cookie })).toMatchObject({
      status: 200,
      body: { user: { email: MANAGER_EMAIL } },
    });
    expect(await callApi(context, 'GET', '/api/auth/me')).toMatchObject({
      status: 401,
      body: { code: 'AUTHENTICATION_REQUIRED' },
    });
    expect(
      (await callApi(context, 'GET', '/api/auth/me', { sessionCookie: 'gh_session=falso' })).status,
    ).toBe(401);
  });

  it('permite editar solo el perfil propio y rechaza correos duplicados', async () => {
    const cookie = await logInAs(context, MANAGER_EMAIL);
    await givenUser(context, { email: 'ocupado@example.test', roles: ['BIDDER'] });

    expect(await callApi(context, 'PUT', '/api/auth/me', {
      sessionCookie: cookie,
      body: { name: 'Nombre actualizado', email: ' NUEVO@example.test ' },
    })).toMatchObject({ status: 200, body: { user: { name: 'Nombre actualizado', email: 'nuevo@example.test', roles: ['MANAGER'] } } });
    expect(await callApi(context, 'GET', '/api/auth/me', { sessionCookie: cookie }))
      .toMatchObject({ body: { user: { name: 'Nombre actualizado' } } });
    expect(await callApi(context, 'PUT', '/api/auth/me', {
      sessionCookie: cookie,
      body: { name: 'Otro', email: 'ocupado@example.test' },
    })).toMatchObject({ status: 409, body: { code: 'EMAIL_ALREADY_REGISTERED' } });
    expect((await callApi(context, 'PUT', '/api/auth/me', {
      sessionCookie: cookie,
      body: { name: 'Otro', email: 'otro@example.test', roles: ['ADMIN'] },
    })).status).toBe(400);
  });

  it('la sesión vence a las 8 horas', async () => {
    const cookie = await logInAs(context, MANAGER_EMAIL);

    context.clock.advanceMinutes(8 * 60 - 1);
    expect((await callApi(context, 'GET', '/api/auth/me', { sessionCookie: cookie })).status).toBe(
      200,
    );

    context.clock.advanceMinutes(1);
    expect((await callApi(context, 'GET', '/api/auth/me', { sessionCookie: cookie })).status).toBe(
      401,
    );
  });

  it('cerrar sesión revoca el token y borra la cookie', async () => {
    const cookie = await logInAs(context, MANAGER_EMAIL);

    const response = await callApi(context, 'POST', '/api/auth/logout', { sessionCookie: cookie });

    expect(response.status).toBe(204);
    expect(response.setCookie).toMatch(/^gh_session=;/);
    expect((await callApi(context, 'GET', '/api/auth/me', { sessionCookie: cookie })).status).toBe(
      401,
    );
  });

  it('rechaza campos desconocidos en el login', async () => {
    const response = await callApi(context, 'POST', '/api/auth/login', {
      body: { email: MANAGER_EMAIL, password: SYNTHETIC_PASSWORD, roles: ['ADMIN'] },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
