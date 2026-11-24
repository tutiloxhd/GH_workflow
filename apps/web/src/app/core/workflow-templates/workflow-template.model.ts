import type { RoleCode } from '../users/user.model';
import type { DueReference, PersonRef } from '../workflow/workflow.model';

export type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface TemplateTask {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly responsibleRole: RoleCode;
  readonly requiresEvidence: boolean;
  readonly dueReference: DueReference;
  readonly dueOffsetDays: number;
  readonly dueOffsetMinutes: number;
  readonly dependsOn: readonly string[];
}

export interface TemplateSummary {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly version: number;
  readonly status: TemplateStatus;
  readonly isActive: boolean;
  readonly taskCount: number;
  readonly workflowCount: number;
  readonly createdAt: string;
  readonly createdBy: PersonRef | null;
  readonly publishedAt: string | null;
  readonly publishedBy: PersonRef | null;
  readonly archivedAt: string | null;
}

export interface TemplateDetail extends TemplateSummary {
  readonly tasks: readonly TemplateTask[];
}

export interface TemplateCatalog {
  readonly roles: readonly RoleCode[];
  readonly dueReferences: readonly DueReference[];
  readonly evidenceFormTaskCodes: readonly string[];
  readonly participantAssignmentTaskCode: string;
}

// Problemas de estructura que informa la API al guardar o publicar.
export interface TemplateIssue {
  readonly kind:
    | 'DUPLICATE_CODE'
    | 'UNKNOWN_DEPENDENCY'
    | 'SELF_DEPENDENCY'
    | 'DEPENDENCY_CYCLE'
    | 'EVIDENCE_FORM_MISSING'
    | 'NO_TASKS';
  readonly taskCode?: string;
  readonly dependsOn?: string;
  readonly taskCodes?: readonly string[];
}

export const TEMPLATE_STATUS_LABELS: Readonly<Record<TemplateStatus, string>> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Archivada',
};

export const TEMPLATE_STATUS_TONES: Readonly<Record<TemplateStatus, string>> = {
  DRAFT: 'alert',
  PUBLISHED: 'info',
  ARCHIVED: 'neutral',
};

export function describeTemplateIssue(issue: TemplateIssue): string {
  switch (issue.kind) {
    case 'DUPLICATE_CODE':
      return `El código ${issue.taskCode ?? ''} está repetido.`;
    case 'UNKNOWN_DEPENDENCY':
      return `${issue.taskCode ?? ''} depende de ${issue.dependsOn ?? ''}, que no existe.`;
    case 'SELF_DEPENDENCY':
      return `${issue.taskCode ?? ''} no puede depender de sí misma.`;
    case 'DEPENDENCY_CYCLE':
      return `Hay un ciclo de dependencias: ${(issue.taskCodes ?? []).join(' → ')}.`;
    case 'EVIDENCE_FORM_MISSING':
      return `${issue.taskCode ?? ''} no tiene formulario de evidencia; no puede exigirla.`;
    case 'NO_TASKS':
      return 'El flujo debe tener al menos una tarea para publicarse.';
  }
}
