export type NotificationTrigger =
  | 'TASK_ASSIGNED'
  | 'TASK_REMINDER'
  | 'TASK_ESCALATION'
  | 'TASK_OVERDUE'
  | 'TASK_COMPLETED'
  | 'WORKFLOW_SUSPENDED'
  | 'WORKFLOW_RESUMED'
  | 'WORKFLOW_CANCELLED'
  | 'WORKFLOW_REPROGRAMMED';

export interface UserNotification {
  readonly id: number;
  readonly trigger: NotificationTrigger;
  readonly title: string;
  readonly body: string;
  readonly workflowId: number;
  readonly taskId: number | null;
  readonly readAt: string | null;
  readonly createdAt: string;
}
