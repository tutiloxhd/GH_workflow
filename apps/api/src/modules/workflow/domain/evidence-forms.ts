import { z } from 'zod';

// Formularios de evidencia por código de tarea. Son básicos y provisorios (para probar el flujo);
// la estructura definitiva la define negocio. Una sola definición sirve para validar en la API
// y para que el frontend dibuje el formulario.

export type EvidenceFieldType = 'TEXT' | 'LONG_TEXT' | 'DATE' | 'AMOUNT_CLP' | 'CHOICE';

export interface EvidenceField {
  readonly name: string;
  readonly label: string;
  readonly type: EvidenceFieldType;
  readonly isRequired: boolean;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export interface EvidenceForm {
  readonly fields: readonly EvidenceField[];
}

const MAX_TEXT_LENGTH = 200;
const MAX_LONG_TEXT_LENGTH = 2000;
// Monto en pesos chilenos como entero (sin decimales); el tope evita valores absurdos.
const MAX_AMOUNT_CLP = 1_000_000_000_000;

const AUCTION_OUTCOMES = [
  { value: 'AWARDED', label: 'Adjudicado' },
  { value: 'NOT_AWARDED', label: 'No adjudicado' },
  { value: 'RESCHEDULED', label: 'Reprogramado' },
  { value: 'DESERTED', label: 'Desierto' },
] as const;

const EVIDENCE_FORMS: Readonly<Record<string, EvidenceForm>> = {
  COLLECT_VALE_VISTA: {
    fields: [
      { name: 'bank', label: 'Banco', type: 'TEXT', isRequired: true },
      { name: 'valeVistaNumber', label: 'N° de Vale Vista', type: 'TEXT', isRequired: true },
      { name: 'amountClp', label: 'Monto (pesos)', type: 'AMOUNT_CLP', isRequired: true },
    ],
  },
  RECORD_DELIVERY_EVIDENCE: {
    fields: [
      { name: 'deliveredOn', label: 'Fecha de entrega', type: 'DATE', isRequired: true },
      { name: 'receivedBy', label: 'Recibido por', type: 'TEXT', isRequired: true },
      { name: 'notes', label: 'Observaciones', type: 'LONG_TEXT', isRequired: false },
    ],
  },
  RECORD_AUCTION_RESULT: {
    fields: [
      {
        name: 'outcome',
        label: 'Resultado',
        type: 'CHOICE',
        isRequired: true,
        options: AUCTION_OUTCOMES,
      },
      {
        name: 'awardedAmountClp',
        label: 'Monto adjudicado (pesos)',
        type: 'AMOUNT_CLP',
        isRequired: false,
      },
      { name: 'notes', label: 'Observaciones', type: 'LONG_TEXT', isRequired: false },
    ],
  },
};

// Códigos de tarea que tienen formulario: solo esas tareas pueden exigir evidencia.
export const EVIDENCE_FORM_TASK_CODES: readonly string[] = Object.keys(EVIDENCE_FORMS);

export const evidenceFormFor = (taskCode: string): EvidenceForm | null =>
  EVIDENCE_FORMS[taskCode] ?? null;

function fieldSchema(field: EvidenceField): z.ZodType {
  const schemaByType: Record<EvidenceFieldType, z.ZodType> = {
    TEXT: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
    LONG_TEXT: z.string().trim().min(1).max(MAX_LONG_TEXT_LENGTH),
    DATE: z.iso.date(),
    AMOUNT_CLP: z.number().int().min(0).max(MAX_AMOUNT_CLP),
    CHOICE: z.enum((field.options ?? []).map((option) => option.value) as [string, ...string[]]),
  };
  const schema = schemaByType[field.type];
  return field.isRequired ? schema : schema.optional();
}

// Reglas entre campos que no caben en la definición de cada campo.
function refineAuctionResult(data: Record<string, unknown>, context: z.RefinementCtx): void {
  if (data.outcome === 'AWARDED' && data.awardedAmountClp === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['awardedAmountClp'],
      message: 'Indica el monto adjudicado',
    });
  }
}

export function evidenceSchemaFor(taskCode: string): z.ZodType<Record<string, unknown>> | null {
  const form = evidenceFormFor(taskCode);
  if (!form) return null;
  const shape = Object.fromEntries(form.fields.map((field) => [field.name, fieldSchema(field)]));
  const schema = z.strictObject(shape);
  return taskCode === 'RECORD_AUCTION_RESULT' ? schema.superRefine(refineAuctionResult) : schema;
}
