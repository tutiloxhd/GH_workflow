import type { Response } from 'express';
import type { ZodError } from 'zod';

export interface Problem {
  readonly status: number;
  // Código estable para que los clientes no dependan del texto.
  readonly code: string;
  readonly title: string;
}

export const PROBLEMS = {
  malformedJson: { status: 400, code: 'MALFORMED_JSON', title: 'El cuerpo JSON no es válido' },
  validationFailed: {
    status: 400,
    code: 'VALIDATION_FAILED',
    title: 'La solicitud tiene campos inválidos',
  },
  authenticationRequired: {
    status: 401,
    code: 'AUTHENTICATION_REQUIRED',
    title: 'Debes iniciar sesión',
  },
  forbidden: { status: 403, code: 'FORBIDDEN', title: 'No tienes permiso para esta acción' },
  originNotAllowed: {
    status: 403,
    code: 'ORIGIN_NOT_ALLOWED',
    title: 'El origen de la solicitud no está permitido',
  },
  notFound: { status: 404, code: 'NOT_FOUND', title: 'Recurso no encontrado' },
  databaseUnavailable: {
    status: 503,
    code: 'DATABASE_UNAVAILABLE',
    title: 'La base de datos no está disponible',
  },
  internalError: { status: 500, code: 'INTERNAL_ERROR', title: 'Error interno' },
} as const satisfies Record<string, Problem>;

export function sendProblem(
  response: Response,
  problem: Problem,
  extensions: Readonly<Record<string, unknown>> = {},
): void {
  response
    .status(problem.status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: problem.title,
      status: problem.status,
      code: problem.code,
      ...extensions,
      requestId: response.locals.requestId as string | undefined,
    });
}

// Solo se informan las rutas de los campos inválidos, nunca los valores recibidos.
export function sendValidationProblem(response: Response, error: ZodError): void {
  const invalidFields = [...new Set(error.issues.map((issue) => issue.path.join('.') || '(raíz)'))];
  sendProblem(response, PROBLEMS.validationFailed, { invalidFields });
}
