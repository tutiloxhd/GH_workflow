import type { Express } from 'express';
import { createHealthRouter } from '../modules/health/health.router.js';
import { createSyncRouter } from '../modules/admin-new-sync/http/sync.router.js';
import type { AdminNewSource } from '../modules/admin-new-sync/persistence/admin-new-source.js';
import type { IdentityDependencies } from '../modules/identity/application/identity-dependencies.js';
import { createAuthRouter } from '../modules/identity/http/auth.router.js';
import { createUsersRouter } from '../modules/identity/http/users.router.js';
import { createWorkflowRouter } from '../modules/workflow/http/workflow.router.js';
import { createNotificationsRouter } from '../modules/notifications/http/notifications.router.js';
import { createApp } from '../platform/http/create-app.js';
import { logger } from '../platform/logging/logger.js';

export interface ApiAppSettings {
  readonly allowedOrigin: string;
  readonly isSecureCookie: boolean;
}

// Raíz de composición: conecta los módulos con sus dependencias concretas.
// El motor comparte base y reloj con identidad.
export function buildApiApp(
  identity: IdentityDependencies,
  settings: ApiAppSettings,
  source: Pick<AdminNewSource, 'readActiveAgentTypes'>,
): Express {
  const workflow = { database: identity.database, clock: identity.clock };
  return createApp({
    allowedOrigin: settings.allowedOrigin,
    routers: [
      { path: '/health', router: createHealthRouter(() => identity.database.ping()) },
      {
        path: '/auth',
        router: createAuthRouter(identity, { isSecure: settings.isSecureCookie }),
      },
      { path: '/users', router: createUsersRouter(identity) },
      { path: '', router: createNotificationsRouter(identity) },
      { path: '/sync', router: createSyncRouter(workflow, identity) },
      { path: '', router: createWorkflowRouter(workflow, identity, source) },
    ],
    reportError: (error, context) => {
      logger.error('http.unexpected_error', error, context);
    },
  });
}
