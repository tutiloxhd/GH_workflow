import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  processDueNotificationJobs,
  processNotificationOutbox,
} from '../src/modules/notifications/application/notification-processor.js';
import {
  callApi,
  logInAs,
  resetIdentityTables,
  startIdentityTestContext,
  type IdentityTestContext,
} from './identity-test-harness.js';
import {
  givenCast,
  givenProperty,
  startWorkflowFor,
  type WorkflowCast,
} from './workflow-test-helpers.js';

describe('notificaciones internas', () => {
  let context: IdentityTestContext;
  let cast: WorkflowCast;

  beforeAll(async () => {
    context = await startIdentityTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetIdentityTables(context);
    cast = await givenCast(context);
  });

  it('materializa una sola asignación para el titular y permite marcarla como leída', async () => {
    await startWorkflowFor(context, cast, await givenProperty(context));
    const dependencies = { database: context.database, clock: context.clock };

    expect(await processNotificationOutbox(dependencies, 'test-worker')).toBeGreaterThan(0);
    await processNotificationOutbox(dependencies, 'test-worker');

    const listed = await callApi(context, 'GET', '/api/notifications', {
      sessionCookie: cast.cookies.admin,
    });
    expect(listed.status).toBe(200);
    const rows = (listed.body as { notifications: Array<{ id: number; readAt: string | null }> })
      .notifications;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.readAt).toBeNull();

    expect(
      (
        await callApi(context, 'POST', `/api/notifications/${rows[0]?.id}/read`, {
          sessionCookie: cast.cookies.admin,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await callApi(context, 'GET', '/api/notifications/unread-count', {
          sessionCookie: cast.cookies.admin,
        })
      ).body,
    ).toEqual({ unreadCount: 0 });
  });

  it('crea el vencimiento al llegar due_at sin detener el workflow', async () => {
    await startWorkflowFor(context, cast, await givenProperty(context));
    const dependencies = { database: context.database, clock: context.clock };
    await processNotificationOutbox(dependencies, 'test-worker');
    context.clock.setTo('2026-11-16T12:00:00.000Z');

    expect(await processDueNotificationJobs(dependencies, 'test-scheduler')).toBeGreaterThan(0);
    const currentAdminCookie = await logInAs(context, 'admin@example.test');
    const listed = await callApi(context, 'GET', '/api/notifications', {
      sessionCookie: currentAdminCookie,
    });
    const triggers = (
      listed.body as { notifications: Array<{ trigger: string }> }
    ).notifications.map((notification) => notification.trigger);
    expect(triggers).toContain('TASK_OVERDUE');
  });
});
