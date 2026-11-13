import { describe, expect, it } from 'vitest';
import { evidenceFormFor, evidenceSchemaFor } from './evidence-forms.js';

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
});
