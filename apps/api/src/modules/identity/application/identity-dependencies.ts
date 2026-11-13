import type { Clock } from '../../../platform/clock/clock.js';
import type { Database } from '../../../platform/database/database.js';
import type { PasswordHasher } from './password-hasher.js';

export type IdentityAuditEvent =
  | 'identity.user_created'
  | 'identity.roles_replaced'
  | 'identity.user_activated'
  | 'identity.user_deactivated';

export interface IdentityDependencies {
  readonly database: Database;
  readonly clock: Clock;
  readonly passwordHasher: PasswordHasher;
  readonly sessionTtlHours: number;
  // Registro de acciones administrativas; solo identificadores, sin datos personales.
  readonly recordAudit: (
    event: IdentityAuditEvent,
    context: { actorUserId: number | null; targetUserId: number },
  ) => void;
}
