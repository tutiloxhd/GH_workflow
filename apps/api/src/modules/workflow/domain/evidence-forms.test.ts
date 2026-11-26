import { describe, expect, it } from 'vitest';
import {
  evidenceFormFor,
  evidenceFormSchema,
  evidenceSchemaFor,
  resolveEvidenceForm,
} from './evidence-forms.js';

describe('formularios de evidencia', () => {
  it('solo las tareas con formulario tienen esquema', () => {
    expect(evidenceFormFor('ASSIGN_MANAGER_AND_BIDDER')).toBeNull();
    expect(evidenceSchemaFor('ASSIGN_MANAGER_AND_BIDDER')).toBeNull();
    expect(evidenceFormFor('COLLECT_VALE_VISTA')?.fields.map((field) => field.name)).toEqual([
      'bank',
      'valeVistaNumber',
      'amountClp',
    ]);
  });

  it('valida tipos, obligatorios y rechaza campos desconocidos', () => {
    const schema = evidenceSchemaFor('COLLECT_VALE_VISTA');

    expect(
      schema?.safeParse({ bank: 'Banco Sintético', valeVistaNumber: 'VV-1', amountClp: 4200000 })
        .success,
    ).toBe(true);
    expect(
      schema?.safeParse({ bank: 'Banco', valeVistaNumber: 'VV-1', amountClp: 10.5 }).success,
    ).toBe(false);
    expect(schema?.safeParse({ bank: 'Banco', valeVistaNumber: 'VV-1' }).success).toBe(false);
    expect(
      schema?.safeParse({ bank: 'B', valeVistaNumber: 'V', amountClp: 1, extra: true }).success,
    ).toBe(false);
  });

  it('un resultado adjudicado exige el monto', () => {
    const schema = evidenceSchemaFor('RECORD_AUCTION_RESULT');

    expect(schema?.safeParse({ outcome: 'NOT_AWARDED' }).success).toBe(true);
    expect(schema?.safeParse({ outcome: 'AWARDED' }).success).toBe(false);
    expect(schema?.safeParse({ outcome: 'AWARDED', awardedAmountClp: 365000000 }).success).toBe(
      true,
    );
    expect(schema?.safeParse({ outcome: 'GANADO' }).success).toBe(false);
  });

  it('las fechas usan formato AAAA-MM-DD', () => {
    const schema = evidenceSchemaFor('RECORD_DELIVERY_EVIDENCE');

    expect(schema?.safeParse({ deliveredOn: '2026-12-01', receivedBy: 'Receptor' }).success).toBe(
      true,
    );
    expect(schema?.safeParse({ deliveredOn: '01-12-2026', receivedBy: 'Receptor' }).success).toBe(
      false,
    );
  });
  it('un formulario guardado reemplaza al inicial y uno vacío equivale a no tener', () => {
    const custom = {
      fields: [
        { name: 'notary', label: 'Notaría', type: 'TEXT', isRequired: true },
        {
          name: 'channel',
          label: 'Canal',
          type: 'CHOICE',
          isRequired: false,
          options: [{ value: 'MAIL', label: 'Correo' }],
        },
      ],
    };
    const form = resolveEvidenceForm('COLLECT_VALE_VISTA', custom);
    expect(form?.fields.map((field) => field.name)).toEqual(['notary', 'channel']);
    expect(evidenceSchemaFor('COLLECT_VALE_VISTA', form)?.safeParse({ notary: 'N1' }).success).toBe(
      true,
    );
    expect(resolveEvidenceForm('COLLECT_VALE_VISTA', { fields: [] })).toBeNull();
  });

  it('resuelve formularios JSON devueltos como texto por MariaDB', () => {
    const form = {
      fields: [{ name: 'receivedBy', label: 'Recibido por', type: 'TEXT', isRequired: true }],
    };

    expect(resolveEvidenceForm('CUSTOM_TASK', JSON.stringify(form))).toEqual(form);
  });

  it('rechaza definiciones con nombres repetidos o listas sin opciones', () => {
    const field = { name: 'notes', label: 'Notas', type: 'TEXT', isRequired: false };
    expect(evidenceFormSchema.safeParse({ fields: [field, field] }).success).toBe(false);
    expect(
      evidenceFormSchema.safeParse({ fields: [{ ...field, type: 'CHOICE', options: [] }] }).success,
    ).toBe(false);
  });
});
