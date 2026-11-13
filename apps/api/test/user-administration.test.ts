import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  deactivateUser,
  replaceUserRoles,
} from '../src/modules/identity/application/user-administration.js';
import type { UserAccount } from '../src/modules/identity/persistence/users-repository.js';
import {
  callApi,
  givenUser,
  logInAs,
  resetIdentityTables,
  startIdentityTestContext,
  type IdentityTestContext,
} from './identity-test-harness.js';

const ADMIN_EMAIL = 'admin@example.test';
const MANAGER_EMAIL = 'gestor@example.test';

describe('administración de usuarios', () => {
  let context: IdentityTestContext;
  let admin: UserAccount;
  let manager: UserAccount;
  let adminCookie: string;

  beforeAll(async () => {
    context = await startIdentityTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetIdentityTables(context);
    admin = await givenUser(context, { email: ADMIN_EMAIL, roles: ['ADMIN'], name: 'Ana Admin' });
    manager = await givenUser(context, {
      email: MANAGER_EMAIL,
      roles: ['MANAGER'],
      name: 'Gabriel Gestor',
    });
    adminCookie = await logInAs(context, ADMIN_EMAIL);
    context.auditEvents.length = 0;
  });

  const asAdmin = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
    callApi(context, method, path, { sessionCookie: adminCookie, body });

  it('un usuario sin rol ADMIN recibe 403 en todos los endpoints de usuarios', async () => {
    const managerCookie = await logInAs(context, MANAGER_EMAIL);
    const asManager = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
      callApi(context, method, path, { sessionCookie: managerCookie, body });

    const responses = await Promise.all([
      asManager('GET', '/api/users'),
      asManager('POST', '/api/users', {
        name: 'X',
        email: 'x@example.test',
        password: 'Valida123',
        roles: ['ADMIN'],
      }),
      asManager('PUT', `/api/users/${manager.id}/roles`, { roles: ['ADMIN'] }),
      asManager('POST', `/api/users/${admin.id}/deactivate`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
    expect(await callApi(context, 'GET', '/api/users')).toMatchObject({ status: 401 });
  });

  it('lista usuarios paginados con búsqueda y sin hash de contraseña', async () => {
    const response = await asAdmin('GET', '/api/users?search=gestor&limit=10');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      users: [
        expect.objectContaining({ id: manager.id, email: MANAGER_EMAIL, roles: ['MANAGER'] }),
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
    expect(response.rawBody).not.toMatch(/password|\$2b\$/i);
  });

  it('la búsqueda trata % y _ como texto literal', async () => {
    const response = await asAdmin('GET', '/api/users?search=%25');

    expect(response.body).toMatchObject({ users: [], total: 0 });
  });

  it('crea un usuario con roles y deja registro de quién los asignó', async () => {
    const response = await asAdmin('POST', '/api/users', {
      name: '  Lucía Legal ',
      email: 'Lucia.Legal@Example.test',
      password: 'Revision2026',
      roles: ['LEGAL_REVIEWER', 'BIDDER'],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      user: {
        name: 'Lucía Legal',
        email: 'lucia.legal@example.test',
        status: 'ACTIVE',
        roles: ['BIDDER', 'LEGAL_REVIEWER'],
      },
    });
    const [rows] = await context.database.pool.query(
      `SELECT DISTINCT ur.assigned_by AS assignedBy FROM user_roles ur
         JOIN users u ON u.id = ur.user_id WHERE u.email = 'lucia.legal@example.test'`,
    );
    expect(rows).toEqual([{ assignedBy: admin.id }]);
    expect(context.auditEvents).toEqual(['identity.user_created']);
    const newUserLogin = await callApi(context, 'POST', '/api/auth/login', {
      body: { email: 'lucia.legal@example.test', password: 'Revision2026' },
    });
    expect(newUserLogin.status).toBe(200);
  });

  it('rechaza un email ya registrado aunque cambien mayúsculas', async () => {
    const response = await asAdmin('POST', '/api/users', {
      name: 'Duplicado',
      email: 'GESTOR@example.test',
      password: 'Valida123',
      roles: [],
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('rechaza contraseñas fuera de la política e informa qué falta', async () => {
    const response = await asAdmin('POST', '/api/users', {
      name: 'Débil',
      email: 'debil@example.test',
      password: 'corta',
      roles: [],
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'PASSWORD_POLICY_VIOLATION',
      violations: ['TOO_SHORT', 'MISSING_UPPERCASE', 'MISSING_DIGIT'],
    });
    expect(response.rawBody).not.toContain('corta');
  });

  it('rechaza roles inexistentes', async () => {
    const response = await asAdmin('PUT', `/api/users/${manager.id}/roles`, {
      roles: ['SUPERUSER'],
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED', invalidFields: ['roles.0'] });
  });

  it('reemplaza los roles de un usuario', async () => {
    const response = await asAdmin('PUT', `/api/users/${manager.id}/roles`, {
      roles: ['MANAGER', 'BIDDER', 'BIDDER'],
    });

    expect(response).toMatchObject({
      status: 200,
      body: { user: { roles: ['BIDDER', 'MANAGER'] } },
    });
    expect(context.auditEvents).toEqual(['identity.roles_replaced']);
  });

  it('un administrador no puede quitarse ADMIN ni desactivarse', async () => {
    const removeOwnAdmin = await asAdmin('PUT', `/api/users/${admin.id}/roles`, {
      roles: ['MANAGER'],
    });
    const deactivateSelf = await asAdmin('POST', `/api/users/${admin.id}/deactivate`);

    for (const response of [removeOwnAdmin, deactivateSelf]) {
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'CANNOT_CHANGE_OWN_ADMIN_ACCESS' });
    }
  });

  // Por HTTP el actor siempre es un admin activo, así que la regla solo se dispara cuando dos
  // admins se desactivan o se quitan ADMIN mutuamente a la vez: el segundo ya no tiene respaldo.
  it('dos admins que se desactivan mutuamente no dejan el sistema sin administradores', async () => {
    const secondAdmin = await givenUser(context, {
      email: 'admin2@example.test',
      roles: ['ADMIN'],
    });

    const first = await deactivateUser(context.dependencies, admin.id, secondAdmin.id);
    const second = await deactivateUser(context.dependencies, secondAdmin.id, admin.id);
    const roleRemoval = await replaceUserRoles(context.dependencies, secondAdmin.id, admin.id, [
      'MANAGER',
    ]);

    expect(first.isSuccess).toBe(true);
    expect(second).toEqual({ isSuccess: false, failure: { code: 'LAST_ADMIN_REQUIRED' } });
    expect(roleRemoval).toEqual({ isSuccess: false, failure: { code: 'LAST_ADMIN_REQUIRED' } });
  });

  it('con dos admins activos uno puede desactivar al otro', async () => {
    const secondAdmin = await givenUser(context, {
      email: 'admin2@example.test',
      roles: ['ADMIN'],
    });

    const response = await asAdmin('POST', `/api/users/${secondAdmin.id}/deactivate`);

    expect(response).toMatchObject({ status: 200, body: { user: { status: 'INACTIVE' } } });
  });

  it('desactivar un usuario revoca sus sesiones abiertas y reactivarlo permite volver a entrar', async () => {
    const managerCookie = await logInAs(context, MANAGER_EMAIL);

    const deactivation = await asAdmin('POST', `/api/users/${manager.id}/deactivate`);
    expect(deactivation).toMatchObject({ status: 200, body: { user: { status: 'INACTIVE' } } });
    expect(
      (await callApi(context, 'GET', '/api/auth/me', { sessionCookie: managerCookie })).status,
    ).toBe(401);

    expect((await asAdmin('POST', `/api/users/${manager.id}/activate`)).status).toBe(200);
    expect(
      (await callApi(context, 'GET', '/api/auth/me', { sessionCookie: managerCookie })).status,
    ).toBe(401);
    expect((await logInAs(context, MANAGER_EMAIL)).length).toBeGreaterThan(0);
  });

  it('responde 404 para un usuario inexistente y 400 para un id inválido', async () => {
    expect(await asAdmin('POST', '/api/users/999999/activate')).toMatchObject({
      status: 404,
      body: { code: 'USER_NOT_FOUND' },
    });
    expect((await asAdmin('POST', '/api/users/abc/activate')).status).toBe(400);
  });
});
