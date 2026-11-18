import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import type { IdentityDependencies } from '../../identity/application/identity-dependencies.js';
import { getCurrentUser, requireRole, requireSession } from '../../identity/http/authorization.js';
import {
  notifications,
  NOTIFICATION_TRIGGERS,
} from '../../../platform/database/schema/notification.schema.js';
import {
  PROBLEMS,
  sendProblem,
  sendValidationProblem,
} from '../../../platform/http/problem-details.js';
import {
  hasAllNotificationTriggers,
  listPublishedNotificationRuleSets,
  publishNotificationRuleSet,
} from '../application/notification-rules.js';

const positiveId = z.coerce.number().int().positive();
const notificationParams = z.strictObject({ notificationId: positiveId });
const ruleSetParams = z.strictObject({ ruleSetId: positiveId });
const rulesBody = z.strictObject({
  rules: z.array(
    z.strictObject({
      eventType: z.enum(NOTIFICATION_TRIGGERS),
      offsetMinutes: z.number().int().min(0).max(525_600),
      isEnabled: z.boolean(),
    }),
  ),
});
const listQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
  unread: z.enum(['true', 'false']).optional(),
});

export function createNotificationsRouter(identity: IdentityDependencies): Router {
  const router = Router();
  router.use(requireSession(identity));

  router.get('/notification-rules', requireRole('ADMIN'), async (_request, response) => {
    response.json({ ruleSets: await listPublishedNotificationRuleSets(identity) });
  });

  router.put('/notification-rules/:ruleSetId', requireRole('ADMIN'), async (request, response) => {
    const parsedParams = ruleSetParams.safeParse(request.params);
    const parsedBody = rulesBody.safeParse(request.body);
    if (!parsedParams.success) {
      sendValidationProblem(response, parsedParams.error);
      return;
    }
    if (!parsedBody.success) {
      sendValidationProblem(response, parsedBody.error);
      return;
    }
    if (!hasAllNotificationTriggers(parsedBody.data.rules)) {
      sendProblem(response, PROBLEMS.validationFailed, { invalidFields: ['rules'] });
      return;
    }
    const ruleSet = await publishNotificationRuleSet(
      identity,
      parsedParams.data.ruleSetId,
      parsedBody.data.rules,
    );
    if (!ruleSet) {
      sendProblem(response, PROBLEMS.notFound);
      return;
    }
    response.json({ ruleSet });
  });

  router.get('/notifications', async (request, response) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) {
      sendValidationProblem(response, parsed.error);
      return;
    }
    const userId = getCurrentUser(response).id;
    const filter =
      parsed.data.unread === 'true'
        ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
        : eq(notifications.userId, userId);
    const rows = await identity.database.db
      .select({
        id: notifications.id,
        trigger: notifications.trigger,
        title: notifications.title,
        body: notifications.body,
        workflowId: notifications.workflowInstanceId,
        taskId: notifications.taskInstanceId,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(filter)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(parsed.data.limit)
      .offset(parsed.data.offset);
    response.json({
      notifications: rows.map((row) => ({
        ...row,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  router.get('/notifications/unread-count', async (_request, response) => {
    const userId = getCurrentUser(response).id;
    const [result] = await identity.database.db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    response.json({ unreadCount: result?.total ?? 0 });
  });

  router.post('/notifications/:notificationId/read', async (request, response) => {
    const parsed = notificationParams.safeParse(request.params);
    if (!parsed.success) {
      sendValidationProblem(response, parsed.error);
      return;
    }
    const userId = getCurrentUser(response).id;
    await identity.database.db
      .update(notifications)
      .set({ readAt: identity.clock.now() })
      .where(
        and(
          eq(notifications.id, parsed.data.notificationId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      );
    response.status(204).end();
  });

  router.post('/notifications/read-all', async (_request, response) => {
    const userId = getCurrentUser(response).id;
    await identity.database.db
      .update(notifications)
      .set({ readAt: identity.clock.now() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    response.status(204).end();
  });

  router.get('/notifications/stream', async (request, response) => {
    const userId = getCurrentUser(response).id;
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    let lastCount = -1;
    const publishCount = async () => {
      const [result] = await identity.database.db
        .select({ total: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
      const current = result?.total ?? 0;
      if (current === lastCount) return;
      lastCount = current;
      response.write(`event: notifications\ndata: ${JSON.stringify({ unreadCount: current })}\n\n`);
    };
    await publishCount();
    const timer = setInterval(() => {
      void publishCount().catch(() => response.end());
    }, 15_000);
    request.once('close', () => {
      clearInterval(timer);
    });
  });

  return router;
}
