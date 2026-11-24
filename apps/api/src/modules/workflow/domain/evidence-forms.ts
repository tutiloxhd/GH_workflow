import { z } from 'zod';

// Formularios de evidencia. Cada tarea de la plantilla guarda el suyo
// (`task_definitions.evidence_form`, ADR 0014) y se versiona con ella. Las tareas heredadas sin
// formulario guardado usan el inicial de su código (DEFAULT_EVIDENCE_FORMS). Una sola definición
// sirve para validar en la API y para que el frontend dibuje el formulario.

export const EVIDENCE_FIELD_TYPES = ['TEXT', 'LONG_TEXT', 'DATE', 'AMOUNT_CLP', 'CHOICE'] as const;
export type EvidenceFieldType = (typeof EVIDENCE_FIELD_TYPES)[number];

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

const DEFAULT_EVIDENCE_FORMS: Readonly<Record<string, EvidenceForm>> = {
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

export const MAX_EVIDENCE_FIELDS = 30;
export const MAX_FIELD_NAME_LENGTH = 50;
export const MAX_FIELD_LABEL_LENGTH = 150;
export const MAX_CHOICE_OPTIONS = 30;
export const FIELD_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

const optionSchema = z.strictObject({
  value: z.string().trim().min(1).max(MAX_FIELD_NAME_LENGTH),
  label: z.string().trim().min(1).max(MAX_FIELD_LABEL_LENGTH),
});

// Definición de un formulario tal como llega del editor o se lee de la base.
export const evidenceFormSchema = z
  .strictObject({
    fields: z
      .array(
        z.strictObject({
          name: z.string().max(MAX_FIELD_NAME_LENGTH).regex(FIELD_NAME_PATTERN),
          label: z.string().trim().min(1).max(MAX_FIELD_LABEL_LENGTH),
          type: z.enum(EVIDENCE_FIELD_TYPES),
          isRequired: z.boolean(),
          options: z.array(optionSchema).max(MAX_CHOICE_OPTIONS).optional(),
        }),
      )
      .max(MAX_EVIDENCE_FIELDS),
  })
  .superRefine((form, context) => {
    const names = form.fields.map((field) => field.name);
    names.forEach((name, index) => {
      if (names.indexOf(name) !== index) {
        context.addIssue({ code: 'custom', path: ['fields', index, 'name'], message: 'repetido' });
      }
    });
    form.fields.forEach((field, index) => {
      const values = (field.options ?? []).map((option) => option.value);
      const isChoice = field.type === 'CHOICE';
      if (isChoice ? values.length === 0 : field.options !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['fields', index, 'options'],
          message: isChoice ? 'una lista necesita opciones' : 'solo las listas tienen opciones',
        });
      }
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          path: ['fields', index, 'options'],
          message: 'opción repetida',
        });
      }
    });
  });

export const defaultEvidenceFormFor = (taskCode: string): EvidenceForm | null =>
  DEFAULT_EVIDENCE_FORMS[taskCode] ?? null;

// Formulario vigente de una tarea: el guardado o, si no tiene, el inicial de su código. Un
// formulario sin campos equivale a no tener formulario.
export function resolveEvidenceForm(taskCode: string, stored: unknown): EvidenceForm | null {
  if (stored === null || stored === undefined) return defaultEvidenceFormFor(taskCode);
  const parsed = evidenceFormSchema.safeParse(stored);
  if (!parsed.success) throw new Error(`Formulario de evidencia inválido en la tarea ${taskCode}`);
  return toEvidenceForm(parsed.data);
}

// Quita las opciones ausentes (exactOptionalPropertyTypes) y trata un formulario vacío como nulo.
export function toEvidenceForm(form: z.output<typeof evidenceFormSchema>): EvidenceForm | null {
  if (form.fields.length === 0) return null;
  return {
    fields: form.fields.map(({ options, ...field }) => (options ? { ...field, options } : field)),
  };
}

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

// Reglas entre campos que no caben en la definición de cada campo. Aplica solo si el formulario
// conserva ambos campos.
function refineAuctionResult(data: Record<string, unknown>, context: z.RefinementCtx): void {
  if (!('outcome' in data)) return;
  if (data.outcome === 'AWARDED' && data.awardedAmountClp === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['awardedAmountClp'],
      message: 'Indica el monto adjudicado',
    });
  }
}

const hasAuctionResultFields = (form: EvidenceForm): boolean =>
  ['outcome', 'awardedAmountClp'].every((name) => form.fields.some((field) => field.name === name));

export function evidenceSchemaFor(
  taskCode: string,
  form: EvidenceForm | null,
): z.ZodType<Record<string, unknown>> | null {
  if (!form) return null;
  const shape = Object.fromEntries(form.fields.map((field) => [field.name, fieldSchema(field)]));
  const schema = z.strictObject(shape);
  return taskCode === 'RECORD_AUCTION_RESULT' && hasAuctionResultFields(form)
    ? schema.superRefine(refineAuctionResult)
    : schema;
}
