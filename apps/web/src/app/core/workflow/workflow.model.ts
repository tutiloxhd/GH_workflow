// Contratos del motor de workflow (apps/api/openapi.yaml) y sus textos visibles.
import type { RoleCode } from '../users/user.model';

export type WorkflowStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'COMPLETED';
export type TaskStatus =
  'BLOCKED' | 'READY' | 'IN_PROGRESS' | 'SUSPENDED' | 'COMPLETED' | 'CANCELLED';
export type ParticipantType = 'MANAGER' | 'BIDDER' | 'LEGAL_REVIEWER';
export type DueReference =
  | 'TASK_ACTIVATED_AT'
  | 'AUCTION_AT'
  | 'GUARANTEE_PAYMENT_AT'
  | 'GUARANTEE_RETURN_AT'
  | 'BALANCE_PAYMENT_AT';

export interface PersonRef {
  readonly id: number;
  readonly name: string | null;
}

export type EvidenceFieldType = 'TEXT' | 'LONG_TEXT' | 'DATE' | 'AMOUNT_CLP' | 'CHOICE';

export interface EvidenceField {
  readonly name: string;
  readonly label: string;
  readonly type: EvidenceFieldType;
  readonly isRequired: boolean;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export interface EvidenceForm {
  readonly fields: readonly EvidenceField[];
}

export type EvidenceData = Readonly<Record<string, string | number>>;

export interface DeadlineRule {
  readonly dueReference: DueReference;
  readonly dueOffsetDays: number;
  readonly dueOffsetMinutes: number;
}

export interface WorkflowTask {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly responsibleRole: RoleCode;
  readonly displayOrder: number;
  readonly status: TaskStatus;
  readonly assignee: PersonRef | null;
  readonly backup: PersonRef | null;
  readonly dependsOn: readonly (string | null)[];
  readonly deadline: DeadlineRule;
  readonly dueAt: string | null;
  readonly isOverdue: boolean;
  readonly activatedAt: string | null;
  readonly completedAt: string | null;
  readonly requiresEvidence: boolean;
  readonly evidenceForm: EvidenceForm | null;
  readonly evidence: { readonly formData: EvidenceData; readonly updatedAt: string } | null;
}

export interface WorkflowParticipant {
  readonly participantType: ParticipantType;
  readonly assignmentType: 'PRIMARY' | 'BACKUP';
  readonly user: PersonRef | null;
}

export interface WorkflowDetail {
  readonly id: number;
  readonly status: WorkflowStatus;
  readonly propertyId: number;
  readonly property: {
    readonly title: string | null;
    readonly address: string | null;
    readonly commune: string | null;
    readonly caseReference: string | null;
    readonly tribunal: string | null;
    readonly auctionBidderName: string | null;
    readonly auctionPayerName: string | null;
  } | null;
  readonly auctionAt: string | null;
  readonly participants: readonly WorkflowParticipant[];
  readonly tasks: readonly WorkflowTask[];
}

export interface WorkflowEvent {
  readonly id: number;
  readonly taskId: number | null;
  readonly actorUserId: number | null;
  readonly eventType: string;
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly occurredAt: string;
}

export interface WorkflowSummary {
  readonly id: number;
  readonly status: WorkflowStatus;
  readonly property: {
    readonly id: number;
    readonly title: string | null;
    readonly commune: string | null;
    readonly region: string | null;
  };
  readonly auctionAt: string | null;
  readonly openTaskCount: number;
  readonly overdueTaskCount: number;
}

export interface WorkflowFilterOptions {
  readonly communes: readonly string[];
  readonly regions: readonly string[];
  readonly responsibles: readonly PersonRef[];
}

export interface PropertyRow {
  readonly id: number;
  readonly title: string | null;
  readonly address: string | null;
  readonly commune: string | null;
  readonly auctionAt: string | null;
  readonly workflow: { readonly id: number; readonly status: WorkflowStatus } | null;
}

export interface MyTask {
  readonly id: number;
  readonly workflowId: number;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: 'READY' | 'IN_PROGRESS';
  readonly dueAt: string | null;
  readonly isOverdue: boolean;
  readonly role: 'ASSIGNEE' | 'BACKUP';
  readonly property: {
    readonly id: number;
    readonly title: string | null;
    readonly commune: string | null;
    readonly auctionAt: string | null;
  };
}

export const WORKFLOW_STATUS_LABELS: Readonly<Record<WorkflowStatus, string>> = {
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Terminado',
};

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  BLOCKED: 'Bloqueada',
  READY: 'Pendiente',
  IN_PROGRESS: 'En curso',
  SUSPENDED: 'Suspendida',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const PARTICIPANT_LABELS: Readonly<Record<ParticipantType, string>> = {
  MANAGER: 'Gestor',
  BIDDER: 'Postor',
  LEGAL_REVIEWER: 'Revisión legal',
};

export const DUE_REFERENCE_LABELS: Readonly<Record<DueReference, string>> = {
  TASK_ACTIVATED_AT: 'Desde que se activa la tarea',
  AUCTION_AT: 'Desde la fecha del remate',
  GUARANTEE_PAYMENT_AT: 'Desde el pago de la garantía',
  GUARANTEE_RETURN_AT: 'Desde la devolución de la garantía',
  BALANCE_PAYMENT_AT: 'Desde el pago del saldo',
};

export const EVENT_LABELS: Readonly<Record<string, string>> = {
  WORKFLOW_CREATED: 'Workflow creado',
  WORKFLOW_SUSPENDED: 'Workflow suspendido',
  WORKFLOW_RESUMED: 'Workflow reanudado',
  WORKFLOW_CANCELLED: 'Workflow cancelado',
  WORKFLOW_COMPLETED: 'Workflow terminado',
  WORKFLOW_REPROGRAMMED: 'Remate reprogramado',
  PARTICIPANTS_ASSIGNED: 'Participantes asignados',
  PARTICIPANT_REPLACED_BY_BACKUP: 'El suplente pasó a ser titular',
  TASK_CREATED: 'Tarea creada',
  TASK_ACTIVATED: 'Tarea activada',
  TASK_ASSIGNED: 'Tarea reasignada',
  TASK_STARTED: 'Tarea en curso',
  EVIDENCE_SUBMITTED: 'Evidencia registrada',
  TASK_COMPLETED: 'Tarea completada',
  TASK_SUSPENDED: 'Tarea suspendida',
  TASK_RESUMED: 'Tarea reanudada',
  TASK_CANCELLED: 'Tarea cancelada',
  TASK_DEADLINE_CHANGED: 'Plazo modificado',
  TASK_DUE_DATE_RECALCULATED: 'Vencimiento recalculado',
};

// Clase CSS de la etiqueta de estado (colores de la maqueta; ver styles.css).
export const TASK_STATUS_TONES: Readonly<Record<TaskStatus, string>> = {
  BLOCKED: 'neutral',
  READY: 'alert',
  IN_PROGRESS: 'info',
  SUSPENDED: 'paused',
  COMPLETED: 'good',
  CANCELLED: 'cancelled',
};

export const WORKFLOW_STATUS_TONES: Readonly<Record<WorkflowStatus, string>> = {
  ACTIVE: 'good',
  SUSPENDED: 'paused',
  CANCELLED: 'cancelled',
  COMPLETED: 'neutral',
};

export const isTaskWorkable = (status: TaskStatus): boolean =>
  status === 'READY' || status === 'IN_PROGRESS';
