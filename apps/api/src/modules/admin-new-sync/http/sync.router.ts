import { Router, type Response } from 'express';
import { z, type ZodType } from 'zod';
import {
  sendProblem,
  sendValidationProblem,
  type Problem,
} from '../../../platform/http/problem-details.js';
import { PROPERTY_CHANGE_STATUSES } from '../../../platform/database/schema/admin-new-sync.schema.js';
import type { IdentityDependencies } from '../../identity/application/identity-dependencies.js';
import { getCurrentUser, requireRole, requireSession } from '../../identity/http/authorization.js';
import {
  getExecutionIssues,
  getSourceChanges,
  getSyncStatus,
  reviewSourceChange,
  type SyncAdministrationDependencies,
  type SyncAdministrationFailure,
} from '../application/sync-administration.js';

export const SYNC_PROBLEMS: Readonly<Record<SyncAdministrationFailure, Problem>> = {
  SYNC_EXECUTION_NOT_FOUND: {
    status: 404,
    code: 'SYNC_EXECUTION_NOT_FOUND',
    title: 'La ejecución de sincronización no existe',
  },
  SOURCE_CHANGE_NOT_FOUND: {
    status: 404,
    code: 'SOURCE_CHANGE_NOT_FOUND',
    title: 'El cambio de origen no existe',
  },
  SOURCE_CHANGE_NOT_REVIEWABLE: {
    status: 409,
    code: 'SOURCE_CHANGE_NOT_REVIEWABLE',
    title: 'Solo se puede marcar como revisado un aviso pendiente de propiedad no aceptada',
  },
};

const positiveId = z.coerce.number().int().positive();
const executionParams = z.strictObject({ executionId: positiveId });
const changeParams = z.strictObject({ changeId: positiveId });
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const changesQuery = z.strictObject({
  status: z.enum(PROPERTY_CHANGE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

function parse<Schema extends ZodType>(
  schema: Schema,
  value: unknown,
  response: Response,
): z.output<Schema> | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  sendValidationProblem(response, parsed.error);
  return undefined;
}

// Estado del sincronizador para administradores. La sincronización corre en su propio proceso
// (src/entrypoints/sync.ts); este router no la dispara.
export function createSyncRouter(
  sync: SyncAdministrationDependencies,
  identity: IdentityDependencies,
): Router {
  const router = Router();
  router.use(requireSession(identity), requireRole('ADMIN'));

  router.get('/status', async (_request, response) => {
    response.json(await getSyncStatus(sync));
  });

  router.get('/executions/:executionId/issues', async (request, response) => {
    const params = parse(executionParams, request.params, response);
    if (!params) return;
    const issues = await getExecutionIssues(sync, params.executionId);
    if (!issues.isSuccess) {
      sendProblem(response, SYNC_PROBLEMS[issues.failure]);
      return;
    }
    response.json({ issues: issues.value });
  });

  router.get('/changes', async (request, response) => {
    const query = parse(changesQuery, request.query, response);
    if (!query) return;
    response.json({
      changes: await getSourceChanges(sync, { status: query.status ?? null, limit: query.limit }),
    });
  });

  router.post('/changes/:changeId/review', async (request, response) => {
    const params = parse(changeParams, request.params, response);
    if (!params) return;
    const outcome = await reviewSourceChange(sync, getCurrentUser(response).id, params.changeId);
    if (!outcome.isSuccess) {
      sendProblem(response, SYNC_PROBLEMS[outcome.failure]);
      return;
    }
    response.json(outcome.value);
  });

  return router;
}
