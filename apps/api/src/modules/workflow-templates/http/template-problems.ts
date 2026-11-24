import type { Problem } from '../../../platform/http/problem-details.js';
import type { TemplateFailureCode } from '../application/template-administration.js';

export const TEMPLATE_PROBLEMS: Readonly<Record<TemplateFailureCode, Problem>> = {
  FORBIDDEN: { status: 403, code: 'FORBIDDEN', title: 'No tienes permiso para esta acción' },
  TEMPLATE_NOT_FOUND: { status: 404, code: 'TEMPLATE_NOT_FOUND', title: 'La plantilla no existe' },
  TEMPLATE_NOT_DRAFT: {
    status: 409,
    code: 'TEMPLATE_NOT_DRAFT',
    title: 'Solo un borrador se puede editar, publicar o eliminar',
  },
  TEMPLATE_NOT_PUBLISHED: {
    status: 409,
    code: 'TEMPLATE_NOT_PUBLISHED',
    title: 'Solo una versión publicada se puede archivar',
  },
  TEMPLATE_ACTIVE: {
    status: 409,
    code: 'TEMPLATE_ACTIVE',
    title: 'La plantilla activa no se puede archivar; publica otra versión primero',
  },
  TEMPLATE_DRAFT_EXISTS: {
    status: 409,
    code: 'TEMPLATE_DRAFT_EXISTS',
    title: 'Este flujo ya tiene un borrador en edición',
  },
  TEMPLATE_CODE_TAKEN: {
    status: 409,
    code: 'TEMPLATE_CODE_TAKEN',
    title: 'Ya existe un flujo con ese código',
  },
  INVALID_TEMPLATE: {
    status: 400,
    code: 'INVALID_TEMPLATE',
    title: 'La definición del flujo no es válida',
  },
};
