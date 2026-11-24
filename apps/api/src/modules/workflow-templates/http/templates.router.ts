import { Router, type Response } from 'express';
import { z, type ZodType } from 'zod';
import { sendProblem, sendValidationProblem } from '../../../platform/http/problem-details.js';
import type { Result } from '../../../platform/result.js';
import type { IdentityDependencies } from '../../identity/application/identity-dependencies.js';
import { getCurrentUser, requireRole, requireSession } from '../../identity/http/authorization.js';
import { ROLE_CODES } from '../../identity/domain/role-code.js';
import type { WorkflowDependencies } from '../../workflow/application/workflow-dependencies.js';
import { DUE_REFERENCES } from '../../workflow/domain/due-date.js';
import { EVIDENCE_FORM_TASK_CODES } from '../../workflow/domain/evidence-forms.js';
import { ASSIGN_PARTICIPANTS_TASK_CODE, type Actor } from '../../workflow/domain/task-rules.js';
import {
  archiveTemplate,
  createDraft,
  deleteDraft,
  getTemplate,
  listTemplates,
  publishTemplate,
  saveDraft,
  type TemplateFailure,
} from '../application/template-administration.js';
import {
  CODE_PATTERN,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TASK_CODE_LENGTH,
  MAX_TASKS_PER_TEMPLATE,
  MAX_TEMPLATE_CODE_LENGTH,
} from '../domain/template-definition.js';
import { TEMPLATE_PROBLEMS } from './template-problems.js';

const positiveId = z.coerce.number().int().positive();
const templateParams = z.strictObject({ templateId: positiveId });
const name = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const taskCode = z.string().trim().max(MAX_TASK_CODE_LENGTH).regex(CODE_PATTERN);
// Un año en días y en minutos, igual que el ajuste de plazo por tarea.
const MAX_OFFSET_DAYS = 365;
const MAX_OFFSET_MINUTES = 525_600;

const createBody = z.union([
  z.strictObject({ sourceTemplateId: positiveId }),
  z.strictObject({
    code: z.string().trim().max(MAX_TEMPLATE_CODE_LENGTH).regex(CODE_PATTERN),
    name,
  }),
]);
const draftBody = z.strictObject({
  name,
  tasks: z
    .array(
      z.strictObject({
        code: taskCode,
        name,
        description: z
          .string()
          .trim()
          .max(MAX_DESCRIPTION_LENGTH)
          .nullable()
          .transform((value) => (value ? value : null)),
        responsibleRole: z.enum(ROLE_CODES),
        requiresEvidence: z.boolean(),
        dueReference: z.enum(DUE_REFERENCES),
        dueOffsetDays: z.number().int().min(-MAX_OFFSET_DAYS).max(MAX_OFFSET_DAYS),
        dueOffsetMinutes: z.number().int().min(-MAX_OFFSET_MINUTES).max(MAX_OFFSET_MINUTES),
        dependsOn: z.array(taskCode).max(MAX_TASKS_PER_TEMPLATE),
      }),
    )
    .max(MAX_TASKS_PER_TEMPLATE),
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

// Administración de plantillas de flujo: borrador → publicada (activa) → archivada.
export function createTemplatesRouter(
  workflow: WorkflowDependencies,
  identity: IdentityDependencies,
): Router {
  const router = Router();
  router.use(requireSession(identity), requireRole('ADMIN'));

  function sendFailure(response: Response, failure: TemplateFailure): void {
    sendProblem(
      response,
      TEMPLATE_PROBLEMS[failure.code],
      failure.issues ? { issues: failure.issues } : {},
    );
  }

  // Responde el detalle actualizado de la plantilla tras un comando exitoso.
  async function respond(
    response: Response,
    outcome: Result<{ templateId: number }, TemplateFailure>,
    successStatus = 200,
  ): Promise<void> {
    if (!outcome.isSuccess) {
      sendFailure(response, outcome.failure);
      return;
    }
    const detail = await getTemplate(workflow, outcome.value.templateId);
    if (!detail.isSuccess) {
      sendFailure(response, detail.failure);
      return;
    }
    response.status(successStatus).json({ template: detail.value });
  }

  router.get('/', async (_request, response) => {
    response.json({ templates: await listTemplates(workflow) });
  });

  // Opciones del editor: roles, referencias de plazo y tareas con comportamiento especial.
  router.get('/catalog', (_request, response) => {
    response.json({
      roles: ROLE_CODES,
      dueReferences: DUE_REFERENCES,
      evidenceFormTaskCodes: EVIDENCE_FORM_TASK_CODES,
      participantAssignmentTaskCode: ASSIGN_PARTICIPANTS_TASK_CODE,
    });
  });

  router.get('/:templateId', async (request, response) => {
    const params = parse(templateParams, request.params, response);
    if (!params) return;
    const detail = await getTemplate(workflow, params.templateId);
    if (!detail.isSuccess) {
      sendFailure(response, detail.failure);
      return;
    }
    response.json({ template: detail.value });
  });

  router.post('/', async (request, response) => {
    const body = parse(createBody, request.body, response);
    if (!body) return;
    await respond(response, await createDraft(workflow, actorOf(response), body), 201);
  });

  router.put('/:templateId', async (request, response) => {
    const params = parse(templateParams, request.params, response);
    const body = params && parse(draftBody, request.body, response);
    if (!params || !body) return;
    await respond(response, await saveDraft(workflow, actorOf(response), params.templateId, body));
  });

  router.post('/:templateId/publish', async (request, response) => {
    const params = parse(templateParams, request.params, response);
    if (!params) return;
    await respond(response, await publishTemplate(workflow, actorOf(response), params.templateId));
  });

  router.post('/:templateId/archive', async (request, response) => {
    const params = parse(templateParams, request.params, response);
    if (!params) return;
    await respond(response, await archiveTemplate(workflow, actorOf(response), params.templateId));
  });

  router.delete('/:templateId', async (request, response) => {
    const params = parse(templateParams, request.params, response);
    if (!params) return;
    const outcome = await deleteDraft(workflow, actorOf(response), params.templateId);
    if (!outcome.isSuccess) {
      sendFailure(response, outcome.failure);
      return;
    }
    response.status(204).end();
  });

  return router;
}
