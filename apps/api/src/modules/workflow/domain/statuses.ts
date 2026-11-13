export const WORKFLOW_STATUSES = ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'COMPLETED'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

// «Vencida» no es un estado: se deriva de due_at en las tareas abiertas.
export const TASK_STATUSES = [
  'BLOCKED',
  'READY',
  'IN_PROGRESS',
  'SUSPENDED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Estados en los que una tarea puede quedar al reanudar una suspensión.
export type ResumableTaskStatus = Extract<TaskStatus, 'READY' | 'IN_PROGRESS'>;

const WORKABLE_TASK_STATUSES: readonly TaskStatus[] = ['READY', 'IN_PROGRESS'];
const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ['COMPLETED', 'CANCELLED'];

// Una tarea en la que alguien puede trabajar ahora.
export const isTaskWorkable = (status: TaskStatus): status is ResumableTaskStatus =>
  WORKABLE_TASK_STATUSES.includes(status);

export const isTaskClosed = (status: TaskStatus): boolean => CLOSED_TASK_STATUSES.includes(status);

export const isWorkflowClosed = (status: WorkflowStatus): boolean =>
  status === 'CANCELLED' || status === 'COMPLETED';
