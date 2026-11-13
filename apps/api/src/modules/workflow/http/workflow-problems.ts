import type { Problem } from '../../../platform/http/problem-details.js';
import type { WorkflowFailure } from '../application/workflow-dependencies.js';

export const EVIDENCE_PROBLEMS = {
  INVALID_EVIDENCE: {
    status: 400,
    code: 'INVALID_EVIDENCE',
    title: 'El formulario de evidencia tiene campos inválidos',
  },
  EVIDENCE_NOT_APPLICABLE: {
    status: 409,
    code: 'EVIDENCE_NOT_APPLICABLE',
    title: 'Esta tarea no tiene formulario de evidencia',
  },
} as const satisfies Record<string, Problem>;

export const WORKFLOW_PROBLEMS: Readonly<Record<WorkflowFailure, Problem>> = {
  PROPERTY_NOT_FOUND: { status: 404, code: 'PROPERTY_NOT_FOUND', title: 'La propiedad no existe' },
  NO_ACTIVE_TEMPLATE: {
    status: 409,
    code: 'NO_ACTIVE_TEMPLATE',
    title: 'No hay una plantilla de workflow activa',
  },
  WORKFLOW_NOT_FOUND: { status: 404, code: 'WORKFLOW_NOT_FOUND', title: 'El workflow no existe' },
  TASK_NOT_FOUND: { status: 404, code: 'TASK_NOT_FOUND', title: 'La tarea no existe' },
  FORBIDDEN: { status: 403, code: 'FORBIDDEN', title: 'No tienes permiso para esta acción' },
  WORKFLOW_NOT_ACTIVE: {
    status: 409,
    code: 'WORKFLOW_NOT_ACTIVE',
    title: 'El workflow no está activo',
  },
  WORKFLOW_NOT_SUSPENDED: {
    status: 409,
    code: 'WORKFLOW_NOT_SUSPENDED',
    title: 'El workflow no está suspendido',
  },
  WORKFLOW_CLOSED: {
    status: 409,
    code: 'WORKFLOW_CLOSED',
    title: 'El workflow ya terminó o fue cancelado',
  },
  TASK_NOT_OPEN: {
    status: 409,
    code: 'TASK_NOT_OPEN',
    title: 'La tarea no está disponible para esta acción',
  },
  PARTICIPANTS_REQUIRED: {
    status: 409,
    code: 'PARTICIPANTS_REQUIRED',
    title: 'Asigna el gestor y el postor antes de completar esta tarea',
  },
  EVIDENCE_REQUIRED: {
    status: 409,
    code: 'EVIDENCE_REQUIRED',
    title: 'La tarea exige evidencia antes de completarse',
  },
  INVALID_PARTICIPANT: {
    status: 400,
    code: 'INVALID_PARTICIPANT',
    title: 'Cada participante debe ser un usuario activo con el rol correspondiente',
  },
  NEW_AUCTION_DATE_REQUIRED: {
    status: 400,
    code: 'NEW_AUCTION_DATE_REQUIRED',
    title: 'Indica la nueva fecha de remate para reanudar',
  },
};
