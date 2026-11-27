import type { Clock } from '../../../platform/clock/clock.js';
import type { Database } from '../../../platform/database/database.js';

export interface WorkflowDependencies {
  readonly database: Database;
  readonly clock: Clock;
}

// Fallos esperados de los comandos del motor; cada uno tiene un código HTTP estable.
export type WorkflowFailure =
  | 'PROPERTY_NOT_FOUND'
  | 'NO_ACTIVE_TEMPLATE'
  | 'WORKFLOW_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'FORBIDDEN'
  | 'WORKFLOW_NOT_ACTIVE'
  | 'WORKFLOW_NOT_SUSPENDED'
  | 'WORKFLOW_CLOSED'
  | 'TASK_NOT_OPEN'
  | 'PARTICIPANTS_REQUIRED'
  | 'EVIDENCE_REQUIRED'
  | 'EVIDENCE_PHOTO_REQUIRED'
  | 'EVIDENCE_PHOTO_LIMIT'
  | 'INVALID_PARTICIPANT'
  | 'NEW_AUCTION_DATE_REQUIRED';
