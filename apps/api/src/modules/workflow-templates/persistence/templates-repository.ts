import { and, asc, count, desc, eq, inArray, max, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import type { DeadlineDayKind } from '../../workflow/domain/due-date.js';
import { resolveEvidenceForm } from '../../workflow/domain/evidence-forms.js';
import { users } from '../../../platform/database/schema/identity.schema.js';
import {
  notificationRules,
  notificationRuleSets,
} from '../../../platform/database/schema/notification.schema.js';
import {
  taskDefinitions,
  taskDependencies,
  workflowInstances,
  workflowTemplates,
} from '../../../platform/database/schema/workflow.schema.js';
import type { TaskDefinitionInput, TemplateStatus } from '../domain/template-definition.js';

export interface PersonRef {
  readonly id: number;
  readonly name: string;
}

export interface TemplateRow {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly version: number;
  readonly status: TemplateStatus;
  readonly isActive: boolean;
  readonly deadlineDayKind: DeadlineDayKind;
  readonly taskCount: number;
  readonly workflowCount: number;
  readonly createdAt: Date;
  readonly createdBy: PersonRef | null;
  readonly publishedAt: Date | null;
  readonly publishedBy: PersonRef | null;
  readonly archivedAt: Date | null;
}

const creator = alias(users, 'creator');
const publisher = alias(users, 'publisher');

const person = (id: number | null, name: string | null): PersonRef | null =>
  id === null || name === null ? null : { id, name };

// Lista las plantillas con su número de tareas y de workflows que las usan.
export async function findTemplates(
  executor: DatabaseExecutor,
  templateId?: number,
): Promise<TemplateRow[]> {
  const taskCounts = executor
    .select({
      templateId: taskDefinitions.workflowTemplateId,
      total: count().as('task_total'),
    })
    .from(taskDefinitions)
    .groupBy(taskDefinitions.workflowTemplateId)
    .as('task_counts');
  const workflowCounts = executor
    .select({
      templateId: workflowInstances.workflowTemplateId,
      total: count().as('workflow_total'),
    })
    .from(workflowInstances)
    .groupBy(workflowInstances.workflowTemplateId)
    .as('workflow_counts');

  const rows = await executor
    .select({
      id: workflowTemplates.id,
      code: workflowTemplates.code,
      name: workflowTemplates.name,
      version: workflowTemplates.version,
      status: workflowTemplates.status,
      isActive: workflowTemplates.isActive,
      deadlineDayKind: workflowTemplates.deadlineDayKind,
      // LEFT JOIN: una plantilla sin tareas o sin workflows no tiene fila en el conteo.
      taskCount: sql<number>`COALESCE(${taskCounts.total}, 0)`.mapWith(Number),
      workflowCount: sql<number>`COALESCE(${workflowCounts.total}, 0)`.mapWith(Number),
      createdAt: workflowTemplates.createdAt,
      createdById: creator.id,
      createdByName: creator.name,
      publishedAt: workflowTemplates.publishedAt,
      publishedById: publisher.id,
      publishedByName: publisher.name,
      archivedAt: workflowTemplates.archivedAt,
    })
    .from(workflowTemplates)
    .leftJoin(taskCounts, eq(taskCounts.templateId, workflowTemplates.id))
    .leftJoin(workflowCounts, eq(workflowCounts.templateId, workflowTemplates.id))
    .leftJoin(creator, eq(creator.id, workflowTemplates.createdBy))
    .leftJoin(publisher, eq(publisher.id, workflowTemplates.publishedBy))
    .where(templateId === undefined ? undefined : eq(workflowTemplates.id, templateId))
    .orderBy(asc(workflowTemplates.code), desc(workflowTemplates.version));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    version: row.version,
    status: row.status,
    isActive: row.isActive,
    deadlineDayKind: row.deadlineDayKind,
    taskCount: row.taskCount,
    workflowCount: row.workflowCount,
    createdAt: row.createdAt,
    createdBy: person(row.createdById, row.createdByName),
    publishedAt: row.publishedAt,
    publishedBy: person(row.publishedById, row.publishedByName),
    archivedAt: row.archivedAt,
  }));
}

export interface LockedTemplate {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly version: number;
  readonly status: TemplateStatus;
  readonly isActive: boolean;
}

// Bloquea la fila de la plantilla para serializar los cambios sobre ella.
export async function lockTemplate(
  executor: DatabaseExecutor,
  templateId: number,
): Promise<LockedTemplate | null> {
  const [template] = await executor
    .select({
      id: workflowTemplates.id,
      code: workflowTemplates.code,
      name: workflowTemplates.name,
      version: workflowTemplates.version,
      status: workflowTemplates.status,
      isActive: workflowTemplates.isActive,
    })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, templateId))
    .for('update');
  return template ?? null;
}

// Bloquea todas las versiones de un código, para crear la siguiente sin carreras.
export async function lockTemplateVersions(
  executor: DatabaseExecutor,
  code: string,
): Promise<{ readonly maxVersion: number; readonly hasDraft: boolean; readonly exists: boolean }> {
  const versions = await executor
    .select({ version: workflowTemplates.version, status: workflowTemplates.status })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.code, code))
    .for('update');
  return {
    maxVersion: Math.max(0, ...versions.map((row) => row.version)),
    hasDraft: versions.some((row) => row.status === 'DRAFT'),
    exists: versions.length > 0,
  };
}

export async function insertDraftTemplate(
  executor: DatabaseExecutor,
  values: { code: string; name: string; version: number; createdBy: number },
): Promise<number> {
  const [created] = await executor
    .insert(workflowTemplates)
    // Toda versión nueva cuenta sus plazos en días hábiles (ADR 0010).
    .values({ ...values, status: 'DRAFT', isActive: false, deadlineDayKind: 'BUSINESS' })
    .$returningId();
  if (!created) throw new Error('No se pudo crear el borrador de plantilla');
  return created.id;
}

export async function findTemplateTasks(
  executor: DatabaseExecutor,
  templateId: number,
): Promise<TaskDefinitionInput[]> {
  const definitions = await executor
    .select({
      id: taskDefinitions.id,
      code: taskDefinitions.code,
      name: taskDefinitions.name,
      description: taskDefinitions.description,
      responsibleRole: taskDefinitions.responsibleRole,
      requiresEvidence: taskDefinitions.requiresEvidence,
      dueReference: taskDefinitions.dueReference,
      dueOffsetDays: taskDefinitions.dueOffsetDays,
      dueOffsetMinutes: taskDefinitions.dueOffsetMinutes,
      diagramX: taskDefinitions.diagramX,
      diagramY: taskDefinitions.diagramY,
      evidenceForm: taskDefinitions.evidenceForm,
    })
    .from(taskDefinitions)
    .where(eq(taskDefinitions.workflowTemplateId, templateId))
    .orderBy(asc(taskDefinitions.displayOrder), asc(taskDefinitions.id));
  if (definitions.length === 0) return [];

  const codeById = new Map(definitions.map((definition) => [definition.id, definition.code]));
  const dependencies = await executor
    .select({
      definitionId: taskDependencies.taskDefinitionId,
      requirementId: taskDependencies.dependsOnTaskDefinitionId,
    })
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskDefinitionId, [...codeById.keys()]));

  return definitions.map((definition) => ({
    code: definition.code,
    name: definition.name,
    description: definition.description,
    responsibleRole: definition.responsibleRole,
    requiresEvidence: definition.requiresEvidence,
    dueReference: definition.dueReference,
    dueOffsetDays: definition.dueOffsetDays,
    dueOffsetMinutes: definition.dueOffsetMinutes,
    dependsOn: dependencies
      .filter((dependency) => dependency.definitionId === definition.id)
      .map((dependency) => codeById.get(dependency.requirementId))
      .filter((code): code is string => code !== undefined)
      .sort(),
    position:
      definition.diagramX === null || definition.diagramY === null
        ? null
        : { x: definition.diagramX, y: definition.diagramY },
    // Se entrega el formulario vigente: al copiar una versión heredada queda guardado.
    evidenceForm: resolveEvidenceForm(definition.code, definition.evidenceForm),
  }));
}

// Reemplaza todas las tareas de un borrador. Un borrador no tiene workflows, así que es seguro.
export async function replaceTemplateTasks(
  executor: DatabaseExecutor,
  templateId: number,
  tasks: readonly TaskDefinitionInput[],
): Promise<void> {
  await deleteTemplateTasks(executor, templateId);
  if (tasks.length === 0) return;

  await executor.insert(taskDefinitions).values(
    tasks.map((task, index) => ({
      workflowTemplateId: templateId,
      code: task.code,
      name: task.name,
      description: task.description,
      responsibleRole: task.responsibleRole,
      displayOrder: index + 1,
      requiresEvidence: task.requiresEvidence,
      dueReference: task.dueReference,
      dueOffsetDays: task.dueOffsetDays,
      dueOffsetMinutes: task.dueOffsetMinutes,
      diagramX: task.position?.x ?? null,
      diagramY: task.position?.y ?? null,
      // Un formulario vacío se guarda como tal para no volver al inicial del código.
      evidenceForm: task.evidenceForm ?? { fields: [] },
    })),
  );
  const inserted = await executor
    .select({ id: taskDefinitions.id, code: taskDefinitions.code })
    .from(taskDefinitions)
    .where(eq(taskDefinitions.workflowTemplateId, templateId));
  const idByCode = new Map(inserted.map((row) => [row.code, row.id]));

  const dependencies = tasks.flatMap((task) =>
    task.dependsOn.map((requirement) => ({
      taskDefinitionId: idByCode.get(task.code),
      dependsOnTaskDefinitionId: idByCode.get(requirement),
    })),
  );
  const resolved = dependencies.filter(
    (dependency): dependency is { taskDefinitionId: number; dependsOnTaskDefinitionId: number } =>
      dependency.taskDefinitionId !== undefined &&
      dependency.dependsOnTaskDefinitionId !== undefined,
  );
  if (resolved.length !== dependencies.length) {
    throw new Error('Dependencia de plantilla sin tarea correspondiente');
  }
  if (resolved.length > 0) await executor.insert(taskDependencies).values(resolved);
}

async function deleteTemplateTasks(executor: DatabaseExecutor, templateId: number): Promise<void> {
  await executor.execute(sql`
    DELETE dependency FROM task_dependencies AS dependency
      JOIN task_definitions AS definition ON definition.id = dependency.task_definition_id
     WHERE definition.workflow_template_id = ${templateId}`);
  await executor.delete(taskDefinitions).where(eq(taskDefinitions.workflowTemplateId, templateId));
}

export async function renameTemplate(
  executor: DatabaseExecutor,
  templateId: number,
  name: string,
): Promise<void> {
  await executor
    .update(workflowTemplates)
    .set({ name })
    .where(eq(workflowTemplates.id, templateId));
}

export async function deleteDraftTemplate(
  executor: DatabaseExecutor,
  templateId: number,
): Promise<void> {
  await deleteTemplateTasks(executor, templateId);
  await executor
    .delete(workflowTemplates)
    .where(and(eq(workflowTemplates.id, templateId), eq(workflowTemplates.status, 'DRAFT')));
}

// Bloquea y devuelve la plantilla activa (a lo sumo una).
export async function lockActiveTemplateId(executor: DatabaseExecutor): Promise<number | null> {
  const active = await executor
    .select({ id: workflowTemplates.id })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.isActive, true))
    .orderBy(desc(workflowTemplates.version))
    .for('update');
  return active[0]?.id ?? null;
}

// Publica la plantilla y la deja como única activa.
export async function publishTemplate(
  executor: DatabaseExecutor,
  templateId: number,
  actorUserId: number,
  now: Date,
): Promise<void> {
  await executor
    .update(workflowTemplates)
    .set({ isActive: false })
    .where(and(eq(workflowTemplates.isActive, true), ne(workflowTemplates.id, templateId)));
  await executor
    .update(workflowTemplates)
    .set({ status: 'PUBLISHED', isActive: true, publishedAt: now, publishedBy: actorUserId })
    .where(eq(workflowTemplates.id, templateId));
}

export async function archiveTemplate(
  executor: DatabaseExecutor,
  templateId: number,
  actorUserId: number,
  now: Date,
): Promise<void> {
  await executor
    .update(workflowTemplates)
    .set({ status: 'ARCHIVED', isActive: false, archivedAt: now, archivedBy: actorUserId })
    .where(eq(workflowTemplates.id, templateId));
}

export interface NotificationRuleCopy {
  readonly eventType: (typeof notificationRules.$inferSelect)['trigger'];
  readonly offsetMinutes: number;
  readonly isEnabled: number;
}

// Reglas de notificación publicadas más recientes de una plantilla, o null si no tiene.
export async function findPublishedNotificationRules(
  executor: DatabaseExecutor,
  templateId: number,
): Promise<NotificationRuleCopy[] | null> {
  const [ruleSet] = await executor
    .select({ id: notificationRuleSets.id })
    .from(notificationRuleSets)
    .where(
      and(
        eq(notificationRuleSets.workflowTemplateId, templateId),
        eq(notificationRuleSets.isPublished, 1),
      ),
    )
    .orderBy(desc(notificationRuleSets.version))
    .limit(1);
  if (!ruleSet) return null;
  return executor
    .select({
      eventType: notificationRules.trigger,
      offsetMinutes: notificationRules.offsetMinutes,
      isEnabled: notificationRules.isEnabled,
    })
    .from(notificationRules)
    .where(eq(notificationRules.ruleSetId, ruleSet.id))
    .orderBy(asc(notificationRules.id));
}

// Crea el conjunto de reglas publicado de una plantilla recién publicada.
export async function insertPublishedNotificationRules(
  executor: DatabaseExecutor,
  templateId: number,
  actorUserId: number,
  rules: readonly NotificationRuleCopy[],
): Promise<void> {
  const [latest] = await executor
    .select({ version: max(notificationRuleSets.version) })
    .from(notificationRuleSets)
    .where(eq(notificationRuleSets.workflowTemplateId, templateId));
  const [created] = await executor
    .insert(notificationRuleSets)
    .values({
      workflowTemplateId: templateId,
      version: (latest?.version ?? 0) + 1,
      isPublished: 1,
      createdBy: actorUserId,
    })
    .$returningId();
  if (!created) throw new Error('No se pudo crear el conjunto de reglas de notificación');
  if (rules.length === 0) return;
  await executor.insert(notificationRules).values(
    rules.map((rule) => ({
      ruleSetId: created.id,
      trigger: rule.eventType,
      offsetMinutes: rule.offsetMinutes,
      isEnabled: rule.isEnabled,
    })),
  );
}
