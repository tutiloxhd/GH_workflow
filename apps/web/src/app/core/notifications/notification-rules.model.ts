export const NOTIFICATION_EVENT_TYPES = [
  'TASK_ASSIGNED',
  'TASK_REMINDER',
  'TASK_ESCALATION',
  'TASK_OVERDUE',
  'TASK_COMPLETED',
  'EVIDENCE_SUBMITTED',
  'WORKFLOW_SUSPENDED',
  'WORKFLOW_RESUMED',
  'WORKFLOW_CANCELLED',
  'WORKFLOW_REPROGRAMMED',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export interface NotificationRule {
  readonly eventType: NotificationEventType;
  readonly offsetMinutes: number;
  readonly isEnabled: boolean;
}
export interface NotificationRuleSet {
  readonly id: number;
  readonly version: number;
  readonly createdAt: string;
  readonly createdBy: { readonly id: number; readonly name: string } | null;
  readonly workflowTemplate: {
    readonly id: number;
    readonly code: string;
    readonly name: string;
    readonly version: number;
  };
  readonly rules: readonly NotificationRule[];
}
export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  TASK_ASSIGNED: 'Tarea asignada',
  TASK_REMINDER: 'Recordatorio de vencimiento',
  TASK_ESCALATION: 'Escalamiento previo',
  TASK_OVERDUE: 'Tarea vencida',
  TASK_COMPLETED: 'Tarea completada',
  EVIDENCE_SUBMITTED: 'Evidencia registrada',
  WORKFLOW_SUSPENDED: 'Workflow suspendido',
  WORKFLOW_RESUMED: 'Workflow reanudado',
  WORKFLOW_CANCELLED: 'Workflow cancelado',
  WORKFLOW_REPROGRAMMED: 'Workflow reprogramado',
};
export const NOTIFICATION_EVENT_DESCRIPTIONS: Record<NotificationEventType, string> = {
  TASK_ASSIGNED: 'Avisa al titular cuando recibe una tarea.',
  TASK_REMINDER: 'Avisa al titular antes del vencimiento.',
  TASK_ESCALATION: 'Avisa a administradores y área legal antes del vencimiento.',
  TASK_OVERDUE: 'Mantiene visible el aviso mientras la tarea siga vencida.',
  TASK_COMPLETED: 'Avisa al titular cuando la tarea se completa.',
  EVIDENCE_SUBMITTED: 'Avisa al revisor legal cuando se guarda la evidencia de una tarea configurada para ello.',
  WORKFLOW_SUSPENDED: 'Avisa a todos los participantes cuando el workflow se suspende.',
  WORKFLOW_RESUMED: 'Avisa a todos los participantes cuando el workflow se reanuda.',
  WORKFLOW_CANCELLED: 'Avisa a todos los participantes cuando el workflow se cancela.',
  WORKFLOW_REPROGRAMMED: 'Avisa a todos los participantes cuando cambia la fecha del remate.',
};
