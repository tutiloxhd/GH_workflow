import { afterEach, describe, expect, it } from 'vitest';
import { createHealthRouter } from '../src/modules/health/health.router.js';
import { createApp } from '../src/platform/http/create-app.js';
import { startServer, TEST_WEB_ORIGIN, type RunningServer } from './http-test-server.js';

interface RunningHealthApp extends RunningServer {
  readonly reportedErrors: unknown[];
}

async function startHealthApp(checkDatabase: () => Promise<void>): Promise<RunningHealthApp> {
  const reportedErrors: unknown[] = [];
  const app = createApp({
    allowedOrigin: TEST_WEB_ORIGIN,
    routers: [{ path: '/health', router: createHealthRouter(checkDatabase) }],
    reportError: (error) => {
      reportedErrors.push(error);
    },
  });
  return { ...(await startServer(app)), reportedErrors };
}

describe('API HTTP', () => {
  let runningApp: RunningHealthApp | undefined;

  afterEach(async () => {
    await runningApp?.close();
    runningApp = undefined;
  });

  it('GET /api/health responde 200 cuando la base está disponible', async () => {
    runningApp = await startHealthApp(() => Promise.resolve());

    const response = await fetch(`${runningApp.baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', database: 'up' });
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /api/health responde 503 sin exponer la causa cuando la base falla', async () => {
    const internalCause = 'Access denied for user synthetic@10.0.0.1';
    runningApp = await startHealthApp(() => Promise.reject(new Error(internalCause)));

    const response = await fetch(`${runningApp.baseUrl}/api/health`);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(JSON.parse(body)).toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' });
    expect(body).not.toContain(internalCause);
  });

  it('una ruta inexistente responde 404 como Problem Details', async () => {
    runningApp = await startHealthApp(() => Promise.resolve());

    const response = await fetch(`${runningApp.baseUrl}/api/no-existe`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('un cuerpo JSON malformado responde 400 sin filtrar detalles internos', async () => {
    runningApp = await startHealthApp(() => Promise.resolve());

    const response = await fetch(`${runningApp.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN },
      body: '{"incompleto":',
    });
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(body)).toMatchObject({ code: 'MALFORMED_JSON' });
    expect(body).not.toContain('SyntaxError');
    expect(runningApp.reportedErrors).toHaveLength(0);
  });

  it.each([
    ['otro origen', { origin: 'https://sitio-ajeno.example' }],
    ['sin origen', {}],
  ])('rechaza un POST con %s antes de procesarlo', async (_case, headers) => {
    runningApp = await startHealthApp(() => Promise.resolve());

    const response = await fetch(`${runningApp.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: '{}',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
  });
});
