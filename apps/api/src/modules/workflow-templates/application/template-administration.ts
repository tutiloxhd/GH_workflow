import { isDuplicateEntryError } from '../../../platform/database/database-errors.js';
import { logger } from '../../../platform/logging/logger.js';
import { fail, succeed, type Result } from '../../../platform/result.js';
import { DEFAULT_NOTIFICATION_RULES } from '../../notifications/application/notification-rules.js';
import type { WorkflowDependencies } from '../../workflow/application/workflow-dependencies.js';
import { isAdmin, type Actor } from '../../workflow/domain/task-rules.js';
import {
  findDefinitionIssues,
  findPublicationIssues,
  type DefinitionIssue,
  type TaskDefinitionInput,
} from '../domain/template-definition.js';
import {
  archiveTemplate as markTemplateArchived,
  deleteDraftTemplate,
  findPublishedNotificationRules,
  findTemplates,
  findTemplateTasks,
  insertDraftTemplate,
  insertPublishedNotificationRules,
  lockActiveTemplateId,
  lockTemplate,
  lockTemplateVersions,
  publishTemplate as markTemplatePublished,
  renameTemplate,
  replaceTemplateTasks,
  type TemplateRow,
} from '../persistence/templates-repository.js';

export type TemplateFailureCode =
  | 'FORBIDDEN'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_NOT_DRAFT'
  | 'TEMPLATE_NOT_PUBLISHED'
  | 'TEMPLATE_ACTIVE'
  | 'TEMPLATE_DRAFT_EXISTS'
  | 'TEMPLATE_CODE_TAKEN'
  | 'INVALID_TEMPLATE';

export interface TemplateFailure {
  readonly code: TemplateFailureCode;
  readonly issues?: readonly DefinitionIssue[];
}

export interface TemplateSummary {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly version: number;
  readonly status: TemplateRow['status'];
  readonly isActive: boolean;
  readonly taskCount: number;
  readonly workflowCount: number;
  readonly createdAt: string;
  readonly createdBy: TemplateRow['createdBy'];
  readonly publishedAt: string | null;
  readonly publishedBy: TemplateRow['publishedBy'];
  readonly archivedAt: string | null;
}

export interface TemplateDetail extends TemplateSummary {
  readonly tasks: readonly TaskDefinitionInput[];
}

export type NewDraftInput =
  { readonly sourceTemplateId: number } | { readonly code: string; readonly name: string };

export interface DraftContent {
  readonly name: string;
  readonly tasks: readonly TaskDefinitionInput[];
}

const toSummary = (row: TemplateRow): TemplateSummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  publishedAt: row.publishedAt?.toISOString() ?? null,
  archivedAt: row.archivedAt?.toISOString() ?? null,
});

const forbidden = (actor: Actor) => (isAdmin(actor) ? null : fail({ code: 'FORBIDDEN' as const }));

export async function listTemplates(
  dependencies: WorkflowDependencies,
): Promise<TemplateSummary[]> {
  return (await findTemplates(dependencies.database.db)).map(toSummary);
}

export async function getTemplate(
  dependencies: WorkflowDependencies,
  templateId: number,
): Promise<Result<TemplateDetail, TemplateFailure>> {
  const { db } = dependencies.database;
  const [row] = await findTemplates(db, templateId);
  if (!row) return fail({ code: 'TEMPLATE_NOT_FOUND' });
  return succeed({ ...toSummary(row), tasks: await findTemplateTasks(db, templateId) });
}

// Crea un borrador: una nueva versión copiando otra plantilla, o un flujo nuevo vacío.
export async function createDraft(
  dependencies: WorkflowDependencies,
  actor: Actor,
  input: NewDraftInput,
): Promise<Result<{ templateId: number }, TemplateFailure>> {
  const denied = forbidden(actor);
  if (denied) return denied;

  try {
    return await dependencies.database.db.transaction(async (transaction) => {
      let code: string;
      let name: string;
      let tasks: readonly TaskDefinitionInput[] = [];
      if ('sourceTemplateId' in input) {
        const source = await lockTemplate(transaction, input.sourceTemplateId);
        if (!source) return fail({ code: 'TEMPLATE_NOT_FOUND' });
        code = source.code;
        name = source.name;
        tasks = await findTemplateTasks(transaction, source.id);
      } else {
        code = input.code;
        name = input.name;
      }

      const versions = await lockTemplateVersions(transaction, code);
      if (!('sourceTemplateId' in input) && versions.exists) {
        return fail({ code: 'TEMPLATE_CODE_TAKEN' });
      }
      if (versions.hasDraft) return fail({ code: 'TEMPLATE_DRAFT_EXISTS' });

      const templateId = await insertDraftTemplate(transaction, {
        code,
        name,
        version: versions.maxVersion + 1,
        createdBy: actor.id,
      });
      await replaceTemplateTasks(transaction, templateId, tasks);
      logger.info('workflow_template.draft_created', { templateId, actorUserId: actor.id });
      return succeed({ templateId });
    });
  } catch (error) {
    // Otro administrador creó la misma versión al mismo tiempo.
    if (isDuplicateEntryError(error)) return fail({ code: 'TEMPLATE_DRAFT_EXISTS' });
    throw error;
  }
}

export async function saveDraft(
  dependencies: WorkflowDependencies,
  actor: Actor,
  templateId: number,
  content: DraftContent,
): Promise<Result<{ templateId: number }, TemplateFailure>> {
  const denied = forbidden(actor);
  if (denied) return denied;

  const issues = findDefinitionIssues(content.tasks);
  if (issues.length > 0) return fail({ code: 'INVALID_TEMPLATE', issues });

  return dependencies.database.db.transaction(async (transaction) => {
    const template = await lockTemplate(transaction, templateId);
    if (!template) return fail({ code: 'TEMPLATE_NOT_FOUND' });
    if (template.status !== 'DRAFT') return fail({ code: 'TEMPLATE_NOT_DRAFT' });

    await renameTemplate(transaction, templateId, content.name);
    await replaceTemplateTasks(transaction, templateId, content.tasks);
    logger.info('workflow_template.draft_saved', { templateId, actorUserId: actor.id });
    return succeed({ templateId });
  });
}

// Publica el borrador y lo deja como única plantilla activa: los workflows nuevos lo usan y los
// existentes conservan su versión. Copia las reglas de notificación de la plantilla que estaba
// activa para que el cambio de flujo no altere los avisos.
export async function publishTemplate(
  dependencies: WorkflowDependencies,
  actor: Actor,
  templateId: number,
): Promise<Result<{ templateId: number }, TemplateFailure>> {
  const denied = forbidden(actor);
  if (denied) return denied;

  return dependencies.database.db.transaction(async (transaction) => {
    const previousActiveId = await lockActiveTemplateId(transaction);
    const template = await lockTemplate(transaction, templateId);
    if (!template) return fail({ code: 'TEMPLATE_NOT_FOUND' });
    if (template.status !== 'DRAFT') return fail({ code: 'TEMPLATE_NOT_DRAFT' });

    const issues = findPublicationIssues(await findTemplateTasks(transaction, templateId));
    if (issues.length > 0) return fail({ code: 'INVALID_TEMPLATE', issues });

    const rules =
      (previousActiveId === null
        ? null
        : await findPublishedNotificationRules(transaction, previousActiveId)) ??
      DEFAULT_NOTIFICATION_RULES.map((rule) => ({
        eventType: rule.eventType,
        offsetMinutes: rule.offsetMinutes,
        isEnabled: rule.isEnabled ? 1 : 0,
      }));

    const now = dependencies.clock.now();
    await markTemplatePublished(transaction, templateId, actor.id, now);
    await insertPublishedNotificationRules(transaction, templateId, actor.id, rules);
    logger.info('workflow_template.published', {
      templateId,
      previousActiveId,
      actorUserId: actor.id,
    });
    return succeed({ templateId });
  });
}

// Archivar retira una versión publicada; sus workflows siguen funcionando con ella.
export async function archiveTemplate(
  dependencies: WorkflowDependencies,
  actor: Actor,
  templateId: number,
): Promise<Result<{ templateId: number }, TemplateFailure>> {
  const denied = forbidden(actor);
  if (denied) return denied;

  return dependencies.database.db.transaction(async (transaction) => {
    const template = await lockTemplate(transaction, templateId);
    if (!template) return fail({ code: 'TEMPLATE_NOT_FOUND' });
    if (template.status !== 'PUBLISHED') return fail({ code: 'TEMPLATE_NOT_PUBLISHED' });
    // Sin plantilla activa no se podrían iniciar workflows: primero se publica otra.
    if (template.isActive) return fail({ code: 'TEMPLATE_ACTIVE' });

    await markTemplateArchived(transaction, templateId, actor.id, dependencies.clock.now());
    logger.info('workflow_template.archived', { templateId, actorUserId: actor.id });
    return succeed({ templateId });
  });
}

// Solo los borradores se eliminan: nunca tuvieron workflows ni historial.
export async function deleteDraft(
  dependencies: WorkflowDependencies,
  actor: Actor,
  templateId: number,
): Promise<Result<{ templateId: number }, TemplateFailure>> {
  const denied = forbidden(actor);
  if (denied) return denied;

  return dependencies.database.db.transaction(async (transaction) => {
    const template = await lockTemplate(transaction, templateId);
    if (!template) return fail({ code: 'TEMPLATE_NOT_FOUND' });
    if (template.status !== 'DRAFT') return fail({ code: 'TEMPLATE_NOT_DRAFT' });

    await deleteDraftTemplate(transaction, templateId);
    logger.info('workflow_template.draft_deleted', { templateId, actorUserId: actor.id });
    return succeed({ templateId });
  });
}
