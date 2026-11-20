import { Router, type Request, type Response } from 'express';
import { z, type ZodType } from 'zod';
import { sendProblem, sendValidationProblem } from '../../../platform/http/problem-details.js';
import type { Result } from '../../../platform/result.js';
import type { IdentityDependencies } from '../../identity/application/identity-dependencies.js';
import { getCurrentUser, requireRole, requireSession } from '../../identity/http/authorization.js';
import { startWorkflow } from '../application/start-workflow.js';
import { completeTask, startTask, submitTaskEvidence } from '../application/task-commands.js';
import {
  assignParticipants,
  cancelWorkflow,
  changeTaskDeadline,
  resumeWorkflow,
  suspendWorkflow,
} from '../application/workflow-administration.js';
import type {
  WorkflowDependencies,
  WorkflowFailure,
} from '../application/workflow-dependencies.js';
import {
  getWorkflowDetail,
  getWorkflowEvents,
  listMyTasks,
  listProperties,
  listWorkflows,
} from '../application/workflow-queries.js';
import { DUE_REFERENCES } from '../domain/due-date.js';
import { PARTICIPANT_TYPES } from '../domain/participants.js';
import { WORKFLOW_STATUSES } from '../domain/statuses.js';
import type { Actor } from '../domain/task-rules.js';
import { EVIDENCE_PROBLEMS, WORKFLOW_PROBLEMS } from './workflow-problems.js';

const positiveId = z.coerce.number().int().positive();
const propertyParams = z.strictObject({ propertyId: positiveId });
const workflowParams = z.strictObject({ workflowId: positiveId });
const taskParams = z.strictObject({ taskId: positiveId });
// Instante con zona explícita (p. ej. 2026-12-07T10:00:00-03:00); se guarda en UTC.
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const reason = z.string().trim().min(1).max(1000);
// Un año en días y en minutos: límites amplios para evitar valores absurdos.
const MAX_OFFSET_DAYS = 365;
const MAX_OFFSET_MINUTES = 525_600;

const participantsBody = z.strictObject({
  assignments: z
    .array(
      z.strictObject({
        participantType: z.enum(PARTICIPANT_TYPES),
        primaryUserId: positiveId,
        backupUserId: positiveId.nullable().default(null),
      }),
    )
    .min(1)
    .max(PARTICIPANT_TYPES.length)
    .refine(
      (assignments) =>
        new Set(assignments.map((assignment) => assignment.participantType)).size ===
        assignments.length,
      { message: 'Cada tipo de participante puede aparecer una sola vez' },
    ),
});
const suspendBody = z.strictObject({ reason, newAuctionAt: instant.optional() });
const resumeBody = z.strictObject({ newAuctionAt: instant.optional(), reason: reason.optional() });
const cancelBody = z.strictObject({ reason });
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const pageFields = {
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
};
const pageQuery = z.strictObject(pageFields);
const workflowsQuery = z.strictObject({
  ...pageFields,
  status: z.enum(WORKFLOW_STATUSES).optional(),
  responsibleUserId: positiveId.optional(),
  commune: z.string().trim().min(1).max(100).optional(),
  region: z.string().trim().min(1).max(100).optional(),
  auctionFrom: instant.optional(),
  auctionTo: instant.optional(),
});
const propertiesQuery = z.strictObject({
  ...pageFields,
  withoutWorkflow: z.enum(['true', 'false']).optional(),
});
// El contenido de formData se valida contra el formulario de la tarea en el caso de uso.
const evidenceBody = z.strictObject({ formData: z.record(z.string(), z.unknown()) });
const deadlineBody = z.strictObject({
  dueReference: z.enum(DUE_REFERENCES),
  dueOffsetDays: z.number().int().min(-MAX_OFFSET_DAYS).max(MAX_OFFSET_DAYS),
  dueOffsetMinutes: z.number().int().min(-MAX_OFFSET_MINUTES).max(MAX_OFFSET_MINUTES).default(0),
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

const actorOf = (response: Response): Actor => {
  const user = getCurrentUser(response);
  return { id: user.id, roles: user.roles };
};

export function createWorkflowRouter(
  workflow: WorkflowDependencies,
  identity: IdentityDependencies,
): Router {
  const router = Router();
  router.use(requireSession(identity));

  // Responde el detalle actualizado del workflow tras un comando exitoso.
  async function respond(
    response: Response,
    outcome: Result<{ workflowId: number }, WorkflowFailure>,
    successStatus = 200,
  ): Promise<void> {
    if (!outcome.isSuccess) {
      sendProblem(response, WORKFLOW_PROBLEMS[outcome.failure]);
      return;
    }
    const detail = await getWorkflowDetail(workflow, actorOf(response), outcome.value.workflowId);
    if (!detail.isSuccess) {
      // El actor actuó pero ya no participa (p. ej. se le reasignó todo): basta con el id.
      response.status(successStatus).json({ workflow: { id: outcome.value.workflowId } });
      return;
    }
    response.status(successStatus).json({ workflow: detail.value });
  }

  router.post(
    '/properties/:propertyId/workflow',
    requireRole('ADMIN'),
    async (request, response) => {
      const params = parse(propertyParams, request.params, response);
      if (!params) return;
      const outcome = await startWorkflow(workflow, actorOf(response).id, params.propertyId);
      if (!outcome.isSuccess) {
        sendProblem(response, WORKFLOW_PROBLEMS[outcome.failure]);
        return;
      }
      await respond(response, outcome, outcome.value.wasCreated ? 201 : 200);
    },
  );

  router.get('/workflows', async (request, response) => {
    const query = parse(workflowsQuery, request.query, response);
    if (!query) return;
    response.json(await listWorkflows(workflow, actorOf(response), query));
  });

  router.get('/properties', requireRole('ADMIN'), async (request, response) => {
    const query = parse(propertiesQuery, request.query, response);
    if (!query) return;
    response.json(
      await listProperties(workflow, {
        limit: query.limit,
        offset: query.offset,
        onlyWithoutWorkflow: query.withoutWorkflow === 'true',
      }),
    );
  });

  router.get('/workflows/:workflowId', async (request, response) => {
    const params = parse(workflowParams, request.params, response);
    if (!params) return;
    const detail = await getWorkflowDetail(workflow, actorOf(response), params.workflowId);
    if (!detail.isSuccess) {
      sendProblem(response, WORKFLOW_PROBLEMS[detail.failure]);
      return;
    }
    response.json({ workflow: detail.value });
  });

  router.get('/workflows/:workflowId/events', async (request, response) => {
    const params = parse(workflowParams, request.params, response);
    if (!params) return;
    const events = await getWorkflowEvents(workflow, actorOf(response), params.workflowId);
    if (!events.isSuccess) {
      sendProblem(response, WORKFLOW_PROBLEMS[events.failure]);
      return;
    }
    response.json({ events: events.value });
  });

  router.put('/workflows/:workflowId/participants', async (request, response) => {
    const params = parse(workflowParams, request.params, response);
    const body = params && parse(participantsBody, request.body, response);
    if (!params || !body) return;
    await respond(
      response,
      await assignParticipants(workflow, actorOf(response), params.workflowId, body.assignments),
    );
  });

  const lifecycleRoute = (
    path: string,
    handle: (request: Request, response: Response, workflowId: number) => Promise<void>,
  ) => {
    router.post(`/workflows/:workflowId/${path}`, async (request, response) => {
      const params = parse(workflowParams, request.params, response);
      if (!params) return;
      await handle(request, response, params.workflowId);
    });
  };

  lifecycleRoute('suspend', async (request, response, workflowId) => {
    const body = parse(suspendBody, request.body, response);
    if (!body) return;
    await respond(response, await suspendWorkflow(workflow, actorOf(response), workflowId, body));
  });

  lifecycleRoute('resume', async (request, response, workflowId) => {
    const body = parse(resumeBody, request.body ?? {}, response);
    if (!body) return;
    await respond(response, await resumeWorkflow(workflow, actorOf(response), workflowId, body));
  });

  lifecycleRoute('cancel', async (request, response, workflowId) => {
    const body = parse(cancelBody, request.body, response);
    if (!body) return;
    await respond(
      response,
      await cancelWorkflow(workflow, actorOf(response), workflowId, body.reason),
    );
  });

  router.get('/tasks/mine', async (request, response) => {
    const query = parse(pageQuery, request.query, response);
    if (!query) return;
    response.json(await listMyTasks(workflow, actorOf(response), query));
  });

  router.post('/tasks/:taskId/start', async (request, response) => {
    const params = parse(taskParams, request.params, response);
    if (!params) return;
    await respond(response, await startTask(workflow, actorOf(response), params.taskId));
  });

  router.put('/tasks/:taskId/evidence', async (request, response) => {
    const params = parse(taskParams, request.params, response);
    const body = params && parse(evidenceBody, request.body, response);
    if (!params || !body) return;

    const outcome = await submitTaskEvidence(
      workflow,
      actorOf(response),
      params.taskId,
      body.formData,
    );
    if (!outcome.isSuccess) {
      const { failure } = outcome;
      if (failure.code === 'INVALID_EVIDENCE') {
        sendProblem(response, EVIDENCE_PROBLEMS.INVALID_EVIDENCE, {
          invalidFields: failure.invalidFields,
        });
      } else if (failure.code === 'EVIDENCE_NOT_APPLICABLE') {
        sendProblem(response, EVIDENCE_PROBLEMS.EVIDENCE_NOT_APPLICABLE);
      } else {
        sendProblem(response, WORKFLOW_PROBLEMS[failure.code]);
      }
      return;
    }
    await respond(response, outcome);
  });

  router.post('/tasks/:taskId/complete', async (request, response) => {
    const params = parse(taskParams, request.params, response);
    if (!params) return;
    await respond(response, await completeTask(workflow, actorOf(response), params.taskId));
  });

  router.put('/tasks/:taskId/deadline', async (request, response) => {
    const params = parse(taskParams, request.params, response);
    const body = params && parse(deadlineBody, request.body, response);
    if (!params || !body) return;
    await respond(
      response,
      await changeTaskDeadline(workflow, actorOf(response), params.taskId, body),
    );
  });

  return router;
}
