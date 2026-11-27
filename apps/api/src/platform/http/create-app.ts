import { randomUUID } from 'node:crypto';
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
  type Router,
} from 'express';
import { PROBLEMS, sendProblem } from './problem-details.js';
import { requireAllowedOrigin } from './require-allowed-origin.js';

export interface MountedRouter {
  // Ruta relativa a /api, por ejemplo '/auth'.
  readonly path: string;
  readonly router: Router;
}

export interface AppDependencies {
  readonly allowedOrigin: string | readonly string[];
  readonly routers: readonly MountedRouter[];
  readonly reportError: (error: unknown, context: { requestId: string }) => void;
}

const API_PREFIX = '/api';
const JSON_BODY_LIMIT = '100kb';
// Tipo de error con el que express.json() señala un cuerpo que no se pudo parsear.
const MALFORMED_JSON_ERROR_TYPE = 'entity.parse.failed';

const assignRequestId: RequestHandler = (_request, response, next) => {
  const requestId = randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};

function isMalformedJsonError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === MALFORMED_JSON_ERROR_TYPE
  );
}

function isBodyTooLargeError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large';
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(assignRequestId);
  app.use(requireAllowedOrigin(dependencies.allowedOrigin));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  for (const { path, router } of dependencies.routers) {
    app.use(`${API_PREFIX}${path}`, router);
  }

  app.use((_request, response) => {
    sendProblem(response, PROBLEMS.notFound);
  });

  // El cliente nunca recibe mensajes internos, SQL ni stack traces.
  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (isBodyTooLargeError(error)) {
      sendProblem(response, { status: 413, code: 'BODY_TOO_LARGE', title: 'El archivo o cuerpo excede el tamaño permitido' });
      return;
    }
    if (isMalformedJsonError(error)) {
      sendProblem(response, PROBLEMS.malformedJson);
      return;
    }
    dependencies.reportError(error, { requestId: response.locals.requestId as string });
    sendProblem(response, PROBLEMS.internalError);
  };
  app.use(handleError);

  return app;
}
