import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2/promise';
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
  taskOf,
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

  it('permite al administrador versionar reglas y rechaza a otros roles', async () => {
    const forbidden = await callApi(context, 'GET', '/api/notification-rules', {
      sessionCookie: cast.cookies.bidder,
    });
    expect(forbidden.status).toBe(403);

    const listed = await callApi(context, 'GET', '/api/notification-rules', {
      sessionCookie: cast.cookies.admin,
    });
    expect(listed.status).toBe(200);
    const [current] = (
      listed.body as {
        ruleSets: Array<{
          id: number;
          version: number;
          rules: Array<{ eventType: string; offsetMinutes: number; isEnabled: boolean }>;
        }>;
      }
    ).ruleSets;
    expect(current?.rules).toHaveLength(10);

    const published = await callApi(context, 'PUT', `/api/notification-rules/${current?.id}`, {
      sessionCookie: cast.cookies.admin,
      body: { rules: current?.rules },
    });
    expect(published.status).toBe(200);
    const publishedRuleSet = (
      published.body as {
        ruleSet: {
          id: number;
          version: number;
          createdAt: string;
          createdBy: { id: number; name: string };
        };
      }
    ).ruleSet;
    expect(publishedRuleSet).toMatchObject({
      version: (current?.version ?? 0) + 1,
      createdBy: { id: cast.admin.id, name: cast.admin.name },
    });
    expect(typeof publishedRuleSet.createdAt).toBe('string');
  });

  it('materializa una sola asignación para el titular y permite marcarla como leída', async () => {
    const workflow = await startWorkflowFor(context, cast, await givenProperty(context));
    const dependencies = { database: context.database, clock: context.clock };

    expect(await processNotificationOutbox(dependencies, 'test-worker')).toBeGreaterThan(0);
    await processNotificationOutbox(dependencies, 'test-worker');

    const listed = await callApi(context, 'GET', '/api/notifications', {
      sessionCookie: cast.cookies.admin,
    });
    expect(listed.status).toBe(200);
    const rows = (
      listed.body as {
        notifications: Array<{
          id: number;
          readAt: string | null;
          trigger: string;
          taskId: number | null;
        }>;
      }
    ).notifications;
    const assignmentTaskId = taskOf(workflow, 'ASSIGN_MANAGER_AND_BIDDER').id;
    const assigned = rows.filter(
      (row) => row.trigger === 'TASK_ASSIGNED' && row.taskId === assignmentTaskId,
    );
    expect(assigned).toHaveLength(1);
    expect(assigned[0]?.readAt).toBeNull();

    expect(
      (
        await callApi(context, 'POST', `/api/notifications/${assigned[0]?.id}/read`, {
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
    ).toEqual({ unreadCount: rows.length - 1 });
  });

  it('crea el vencimiento al llegar due_at sin detener el workflow', async () => {
    await startWorkflowFor(context, cast, await givenProperty(context));
    const dependencies = { database: context.database, clock: context.clock };
    await processNotificationOutbox(dependencies, 'test-worker');
    context.clock.setTo('2026-11-18T12:00:00.000Z');

    expect(await processDueNotificationJobs(dependencies, 'test-scheduler')).toBeGreaterThan(0);
    const currentAdminCookie = await logInAs(context, 'admin@example.test');
    const listed = await callApi(context, 'GET', '/api/notifications', {
      sessionCookie: currentAdminCookie,
    });
    const triggers = (
      listed.body as { notifications: Array<{ trigger: string }> }
    ).notifications.map((notification) => notification.trigger);
    expect(triggers).toContain('TASK_OVERDUE');

    const [events] = await context.database.pool.execute<
      (RowDataPacket & { event_type: string; event_source: string })[]
    >(
      `SELECT event_type, event_source
         FROM workflow_events
        WHERE event_type IN ('TASK_DUE_SOON', 'TASK_OVERDUE')
        ORDER BY event_type`,
    );
    expect(events).toEqual([
      expect.objectContaining({ event_type: 'TASK_DUE_SOON', event_source: 'SYSTEM' }),
      expect.objectContaining({ event_type: 'TASK_OVERDUE', event_source: 'SYSTEM' }),
    ]);

    await processDueNotificationJobs(dependencies, 'test-scheduler');
    const [eventCount] = await context.database.pool.execute<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total
         FROM workflow_events
        WHERE event_type IN ('TASK_DUE_SOON', 'TASK_OVERDUE')`,
    );
    expect(eventCount[0]?.total).toBe(2);
  });
});
