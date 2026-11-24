import type { RoleCode } from '../../identity/domain/role-code.js';
import type { DueReference } from '../../workflow/domain/due-date.js';
import { evidenceFormFor } from '../../workflow/domain/evidence-forms.js';

// Ciclo de vida de una plantilla: se edita como borrador, se publica (inmutable) y se archiva.
// Solo una versión publicada puede estar activa; los workflows nuevos usan la activa.
export const TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

// Códigos en mayúsculas con guion bajo, como los de la plantilla original.
export const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
export const MAX_TEMPLATE_CODE_LENGTH = 100;
export const MAX_TASK_CODE_LENGTH = 50;
export const MAX_NAME_LENGTH = 150;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_TASKS_PER_TEMPLATE = 100;

export interface TaskDefinitionInput {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly responsibleRole: RoleCode;
  readonly requiresEvidence: boolean;
  readonly dueReference: DueReference;
  readonly dueOffsetDays: number;
  readonly dueOffsetMinutes: number;
  // Códigos de las tareas que deben estar completadas antes de activar esta.
  readonly dependsOn: readonly string[];
}

export type DefinitionIssue =
  | { readonly kind: 'DUPLICATE_CODE'; readonly taskCode: string }
  | { readonly kind: 'UNKNOWN_DEPENDENCY'; readonly taskCode: string; readonly dependsOn: string }
  | { readonly kind: 'SELF_DEPENDENCY'; readonly taskCode: string }
  | { readonly kind: 'DEPENDENCY_CYCLE'; readonly taskCodes: readonly string[] }
  | { readonly kind: 'EVIDENCE_FORM_MISSING'; readonly taskCode: string }
  | { readonly kind: 'NO_TASKS' };

// Reglas estructurales que debe cumplir el borrador en todo momento.
export function findDefinitionIssues(tasks: readonly TaskDefinitionInput[]): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const codes = new Set<string>();
  for (const task of tasks) {
    if (codes.has(task.code)) issues.push({ kind: 'DUPLICATE_CODE', taskCode: task.code });
    codes.add(task.code);
  }

  for (const task of tasks) {
    for (const requirement of task.dependsOn) {
      if (requirement === task.code) issues.push({ kind: 'SELF_DEPENDENCY', taskCode: task.code });
      else if (!codes.has(requirement)) {
        issues.push({ kind: 'UNKNOWN_DEPENDENCY', taskCode: task.code, dependsOn: requirement });
      }
    }
    // Exigir evidencia sin formulario dejaría la tarea imposible de completar.
    if (task.requiresEvidence && evidenceFormFor(task.code) === null) {
      issues.push({ kind: 'EVIDENCE_FORM_MISSING', taskCode: task.code });
    }
  }

  const cycle = findCycle(tasks);
  if (cycle) issues.push({ kind: 'DEPENDENCY_CYCLE', taskCodes: cycle });
  return issues;
}

// Para publicar, además, debe haber al menos una tarea (que sin ciclos implica una inicial).
export function findPublicationIssues(tasks: readonly TaskDefinitionInput[]): DefinitionIssue[] {
  const issues = findDefinitionIssues(tasks);
  return tasks.length === 0 ? [{ kind: 'NO_TASKS' }, ...issues] : issues;
}

// Devuelve los códigos de un ciclo de dependencias, o null si el grafo es acíclico.
function findCycle(tasks: readonly TaskDefinitionInput[]): string[] | null {
  const requirements = new Map(tasks.map((task) => [task.code, task.dependsOn]));
  const state = new Map<string, 'VISITING' | 'DONE'>();
  const path: string[] = [];

  const visit = (code: string): string[] | null => {
    if (state.get(code) === 'DONE') return null;
    if (state.get(code) === 'VISITING') return [...path.slice(path.indexOf(code)), code];
    state.set(code, 'VISITING');
    path.push(code);
    for (const requirement of requirements.get(code) ?? []) {
      if (requirement === code || !requirements.has(requirement)) continue;
      const cycle = visit(requirement);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(code, 'DONE');
    return null;
  };

  for (const task of tasks) {
    const cycle = visit(task.code);
    if (cycle) return cycle;
  }
  return null;
}
