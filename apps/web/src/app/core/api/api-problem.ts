import { HttpErrorResponse } from '@angular/common/http';

// Errores de la API en formato Problem Details; el cliente decide por `code`, nunca por el texto.
export interface ApiProblem {
  readonly status: number;
  readonly code: string;
  readonly violations?: readonly string[];
  readonly invalidFields?: readonly string[];
  // Detalle estructurado de algunos errores (p. ej. problemas de una plantilla de flujo).
  readonly issues?: readonly Readonly<Record<string, unknown>>[];
}

const NETWORK_FAILURE_CODE = 'NETWORK_FAILURE';

export function toApiProblem(error: unknown): ApiProblem {
  if (!(error instanceof HttpErrorResponse)) return { status: 0, code: NETWORK_FAILURE_CODE };

  const body: unknown = error.error;
  if (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof body.code === 'string'
  ) {
    const stringsOf = (value: unknown): string[] | undefined =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : undefined;
    const violations = 'violations' in body ? stringsOf(body.violations) : undefined;
    const invalidFields = 'invalidFields' in body ? stringsOf(body.invalidFields) : undefined;
    const issues =
      'issues' in body && Array.isArray(body.issues)
        ? body.issues.filter(
            (issue): issue is Readonly<Record<string, unknown>> =>
              typeof issue === 'object' && issue !== null,
          )
        : undefined;
    return {
      status: error.status,
      code: body.code,
      ...(violations ? { violations } : {}),
      ...(invalidFields ? { invalidFields } : {}),
      ...(issues ? { issues } : {}),
    };
  }
  return { status: error.status, code: error.status === 0 ? NETWORK_FAILURE_CODE : 'UNKNOWN' };
}

// Mensajes en español para los códigos que la interfaz muestra al usuario.
const PROBLEM_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_CREDENTIALS: 'Email o contraseña incorrectos.',
  LOGIN_TEMPORARILY_LOCKED:
    'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentarlo.',
  EMAIL_ALREADY_REGISTERED: 'Ya existe un usuario con ese email.',
  PASSWORD_POLICY_VIOLATION: 'La contraseña no cumple la política.',
  CANNOT_CHANGE_OWN_ADMIN_ACCESS:
    'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta.',
  LAST_ADMIN_REQUIRED: 'Debe quedar al menos un administrador activo.',
  USER_NOT_FOUND: 'El usuario ya no existe.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NETWORK_FAILURE: 'No se pudo conectar con el servidor. Revisa tu conexión.',
  WORKFLOW_NOT_ACTIVE: 'El remate no está activo: no se pueden avanzar tareas.',
  WORKFLOW_NOT_SUSPENDED: 'El remate no está suspendido.',
  WORKFLOW_CLOSED: 'El remate ya terminó o fue cancelado.',
  TASK_NOT_OPEN: 'La tarea ya no está disponible para esta acción. Actualiza la vista.',
  PARTICIPANTS_REQUIRED: 'Asigna el gestor y el postor antes de completar esta tarea.',
  EVIDENCE_REQUIRED: 'Guarda la evidencia antes de completar la tarea.',
  INVALID_EVIDENCE: 'La evidencia tiene campos inválidos.',
  INVALID_PARTICIPANT: 'Cada participante debe ser un usuario activo con el rol correspondiente.',
  NEW_AUCTION_DATE_REQUIRED: 'Indica la nueva fecha del remate para reanudar.',
  WORKFLOW_NOT_FOUND: 'El remate no existe.',
  TASK_NOT_FOUND: 'La tarea no existe.',
  PROPERTY_NOT_FOUND: 'La propiedad no existe.',
  NO_ACTIVE_TEMPLATE: 'No hay una plantilla de workflow activa.',
  VALIDATION_FAILED: 'Revisa los datos ingresados.',
  SYNC_EXECUTION_NOT_FOUND: 'La ejecución de sincronización ya no existe.',
  SOURCE_CHANGE_NOT_FOUND: 'El cambio de origen ya no existe.',
  TEMPLATE_NOT_FOUND: 'El flujo ya no existe.',
  TEMPLATE_NOT_DRAFT: 'Solo un borrador se puede editar, publicar o eliminar. Actualiza la vista.',
  TEMPLATE_NOT_PUBLISHED: 'Solo una versión publicada se puede archivar.',
  TEMPLATE_ACTIVE: 'La versión activa no se puede archivar; publica otra versión primero.',
  TEMPLATE_DRAFT_EXISTS: 'Este flujo ya tiene un borrador en edición.',
  TEMPLATE_CODE_TAKEN: 'Ya existe un flujo con ese código.',
  INVALID_TEMPLATE: 'El flujo tiene problemas que impiden guardarlo o publicarlo.',
  SOURCE_CHANGE_NOT_REVIEWABLE:
    'Este cambio ya fue revisado o no se revisa a mano. Actualiza la vista.',
};

const FALLBACK_MESSAGE = 'Ocurrió un error inesperado. Inténtalo nuevamente.';

export const problemMessage = (problem: ApiProblem): string =>
  PROBLEM_MESSAGES[problem.code] ?? FALLBACK_MESSAGE;
