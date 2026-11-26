import { Router } from 'express';
import { z } from 'zod';
import type { IdentityDependencies } from '../../identity/application/identity-dependencies.js';
import { getCurrentUser, requireSession } from '../../identity/http/authorization.js';
import {
  PROBLEMS,
  sendProblem,
  sendValidationProblem,
} from '../../../platform/http/problem-details.js';
import {
  hasPushSubscription,
  isAllowedPushEndpoint,
  revokePushSubscription,
  savePushSubscription,
} from '../application/push-subscriptions.js';

const endpoint = z.url().max(2048).refine(isAllowedPushEndpoint);
const pushKey = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/);
const pushSubscription = z.strictObject({
  endpoint,
  keys: z.strictObject({
    p256dh: pushKey,
    auth: pushKey,
  }),
});
const endpointBody = z.strictObject({ endpoint });

export function createPushRouter(identity: IdentityDependencies, publicKey?: string): Router {
  const router = Router();
  router.use(requireSession(identity));

  router.get('/push/config', (_request, response) => {
    response.json({ isEnabled: Boolean(publicKey), publicKey: publicKey ?? null });
  });

  router.post('/push/subscriptions', async (request, response) => {
    if (!publicKey) {
      sendProblem(response, PROBLEMS.notFound);
      return;
    }
    const parsed = pushSubscription.safeParse(request.body);
    if (!parsed.success) {
      sendValidationProblem(response, parsed.error);
      return;
    }
    const result = await savePushSubscription(
      identity.database,
      getCurrentUser(response).id,
      parsed.data,
    );
    if (result === 'owned-by-another-user') {
      sendProblem(response, PROBLEMS.forbidden);
      return;
    }
    response.status(204).end();
  });

  router.post('/push/subscriptions/status', async (request, response) => {
    if (!publicKey) {
      sendProblem(response, PROBLEMS.notFound);
      return;
    }
    const parsed = endpointBody.safeParse(request.body);
    if (!parsed.success) {
      sendValidationProblem(response, parsed.error);
      return;
    }
    response.json({
      isSubscribed: await hasPushSubscription(
        identity.database,
        getCurrentUser(response).id,
        parsed.data.endpoint,
      ),
    });
  });

  router.delete('/push/subscriptions', async (request, response) => {
    if (!publicKey) {
      response.status(204).end();
      return;
    }
    const parsed = endpointBody.safeParse(request.body);
    if (!parsed.success) {
      sendValidationProblem(response, parsed.error);
      return;
    }
    await revokePushSubscription(
      identity.database,
      getCurrentUser(response).id,
      parsed.data.endpoint,
    );
    response.status(204).end();
  });
  return router;
}
