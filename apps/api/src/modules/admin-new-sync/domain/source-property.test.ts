import { describe, expect, it } from 'vitest';
import {
  changedSnapshotFields,
  normalizeSourceProperty,
  parseClpAmount,
  parseSourceDate,
  parseSourceTime,
  type SourceDetail,
  type SourceProperty,
} from './source-property.js';

const baseDetail: SourceDetail = {
  rowId: 14471,
  court: 'C.A. de Santiago',
  tribunal: '17° Juzgado Civil de Santiago',
  caseReference: 'c-0001-2026',
  auctionDate: '2026-12-07',
  guaranteeAmount: '8.100.000',
  guaranteePaymentDate: '2026-12-04',
  guaranteeReturnDate: '2026-12-09',
  balancePaymentDate: '2026-12-14',
  guaranteeWindowStart: '09:00:00',
  guaranteeWindowEnd: '12:00:00',
};

const baseSource: SourceProperty = {
  adminNewId: 13815,
  name: 'Edificio sintético',
  location: 'Calle Sintética 123',
  commune: 'Ñuñoa',
  region: 'Región Metropolitana',
  detail: baseDetail,
  detailRowCount: 1,
  auction: { rowId: 501, auctionTime: '10:30' },
  auctionRowCount: 1,
};

const withDetail = (changes: Partial<SourceDetail>): SourceProperty => ({
  ...baseSource,
  detail: { ...baseDetail, ...changes },
});

const issueCodes = (source: SourceProperty) =>
  normalizeSourceProperty(source).issues.map((issue) => issue.code);

describe('lectura de valores de admin_new', () => {
  it.each([
    ['2026-12-07', { year: 2026, month: 12, day: 7 }],
    ['2026-02-30', null],
    ['07-12-2026', null],
    ['2026-12-7', null],
  ])('fecha %s', (value, expected) => {
    expect(parseSourceDate(value)).toEqual(expected);
  });

  it.each([
    ['09:00', { hour: 9, minute: 0 }],
    ['9:30', { hour: 9, minute: 30 }],
    ['11.30', { hour: 11, minute: 30 }],
    ['12:00:00', { hour: 12, minute: 0 }],
    ['25:00', null],
    ['mediodía', null],
  ])('hora %s', (value, expected) => {
    expect(parseSourceTime(value)).toEqual(expected);
  });

  it.each([
    ['8.100.000', '8100000.00'],
    ['71.400.000', '71400000.00'],
    ['$ 1.200.000', '1200000.00'],
    ['950000', '950000.00'],
    ['1.234,5', '1234.50'],
    ['8,100,000', null],
    ['1.23.000', null],
    ['', null],
  ])('monto %s', (value, expected) => {
    expect(parseClpAmount(value)).toBe(expected);
  });
});

describe('normalización de una propiedad', () => {
  it('convierte fecha y hora del remate de Santiago a UTC', () => {
    const { snapshot, issues } = normalizeSourceProperty(baseSource);

    // Diciembre: horario de verano de Chile (UTC−3).
    expect(snapshot.auctionAt?.toISOString()).toBe('2026-12-07T13:30:00.000Z');
    expect(snapshot.guaranteePaymentAt?.toISOString()).toBe('2026-12-04T15:00:00.000Z');
    expect(snapshot.guaranteeReturnAt?.toISOString()).toBe('2026-12-09T03:00:00.000Z');
    expect(snapshot.guaranteeAmount).toBe('8100000.00');
    expect(snapshot.guaranteeWindowStart).toBe('09:00:00');
    expect(snapshot.court).toBe('C.A. de Santiago');
    expect(issues).toEqual([]);
  });

  it('sin hora de remate usa 00:00 y lo advierte', () => {
    const source = { ...baseSource, auction: { rowId: 501, auctionTime: '  ' } };
    const { snapshot, issues } = normalizeSourceProperty(source);

    expect(snapshot.auctionAt?.toISOString()).toBe('2026-12-07T03:00:00.000Z');
    expect(issues.map((issue) => issue.code)).toEqual(['MISSING_AUCTION_TIME']);
  });

  it('informa los valores inválidos en vez de completarlos', () => {
    const source = withDetail({ auctionDate: '07/12/2026', guaranteeAmount: 'a convenir' });
    const { snapshot } = normalizeSourceProperty(source);

    expect(snapshot.auctionAt).toBeNull();
    expect(snapshot.guaranteeAmount).toBeNull();
    expect(issueCodes(source)).toEqual(['INVALID_DATE', 'INVALID_AMOUNT']);
  });

  it('advierte filas duplicadas y la falta de detalle', () => {
    expect(issueCodes({ ...baseSource, detailRowCount: 2, auctionRowCount: 3 })).toEqual([
      'DUPLICATE_DETAIL_ROWS',
      'DUPLICATE_AUCTION_ROWS',
    ]);
    expect(issueCodes({ ...baseSource, detail: null, detailRowCount: 0 })).toEqual([
      'MISSING_DETAIL_ROW',
    ]);
  });

  it('recorta textos más largos que la columna', () => {
    const { snapshot, issues } = normalizeSourceProperty({
      ...baseSource,
      commune: 'x'.repeat(120),
    });

    expect(snapshot.commune).toHaveLength(100);
    expect(issues.map((issue) => issue.code)).toEqual(['VALUE_TRUNCATED']);
  });

  it('el hash cambia con cualquier valor de origen y no con espacios iguales', () => {
    const original = normalizeSourceProperty(baseSource).sourceHash;

    expect(normalizeSourceProperty({ ...baseSource }).sourceHash).toBe(original);
    expect(normalizeSourceProperty(withDetail({ auctionDate: '2026-12-08' })).sourceHash).not.toBe(
      original,
    );
    expect(normalizeSourceProperty(withDetail({ rowId: 14472 })).sourceHash).not.toBe(original);
  });

  it('detecta qué campos cambiaron', () => {
    const before = normalizeSourceProperty(baseSource).snapshot;
    const after = normalizeSourceProperty({
      ...withDetail({ auctionDate: '2026-12-08' }),
      commune: 'Providencia',
    }).snapshot;

    expect(changedSnapshotFields(before, after)).toEqual(['commune', 'auctionAt']);
    expect(changedSnapshotFields(before, { ...before })).toEqual([]);
  });
});
