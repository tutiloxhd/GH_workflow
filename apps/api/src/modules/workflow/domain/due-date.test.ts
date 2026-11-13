import { describe, expect, it } from 'vitest';
import {
  addBusinessCalendarDays,
  computeDeadline,
  isOverdue,
  type BusinessDates,
} from './due-date.js';

const noBusinessDates: BusinessDates = {
  auctionAt: null,
  guaranteePaymentAt: null,
  guaranteeReturnAt: null,
  balancePaymentAt: null,
};

describe('addBusinessCalendarDays', () => {
  it('suma días conservando la hora local en un período sin cambio de horario', () => {
    // 12 nov 2026 09:30 en Santiago (UTC-3).
    expect(addBusinessCalendarDays(new Date('2026-11-12T12:30:00.000Z'), 3).toISOString()).toBe(
      '2026-11-15T12:30:00.000Z',
    );
  });

  it('al adelantar el reloj (septiembre) tres días duran 71 horas', () => {
    // Viernes 4 sep 2026 10:00 (UTC-4) → lunes 7 sep 10:00 (UTC-3).
    expect(addBusinessCalendarDays(new Date('2026-09-04T14:00:00.000Z'), 3).toISOString()).toBe(
      '2026-09-07T13:00:00.000Z',
    );
  });

  it('al atrasar el reloj (abril) tres días duran 73 horas', () => {
    // Viernes 3 abr 2026 10:00 (UTC-3) → lunes 6 abr 10:00 (UTC-4).
    expect(addBusinessCalendarDays(new Date('2026-04-03T13:00:00.000Z'), 3).toISOString()).toBe(
      '2026-04-06T14:00:00.000Z',
    );
  });

  it('admite días negativos (plazos antes de una fecha de negocio)', () => {
    expect(addBusinessCalendarDays(new Date('2026-11-15T12:30:00.000Z'), -3).toISOString()).toBe(
      '2026-11-12T12:30:00.000Z',
    );
  });
});

describe('computeDeadline', () => {
  const clockStart = new Date('2026-11-12T12:00:00.000Z');

  it('mide desde el inicio del plazo cuando la referencia es la activación', () => {
    const deadline = computeDeadline(
      { dueReference: 'TASK_ACTIVATED_AT', dueOffsetDays: 3, dueOffsetMinutes: 0 },
      clockStart,
      noBusinessDates,
    );

    expect(deadline.dueReferenceAt).toEqual(clockStart);
    expect(deadline.dueAt?.toISOString()).toBe('2026-11-15T12:00:00.000Z');
  });

  it('mide desde la fecha de negocio, con días y minutos', () => {
    const auctionAt = new Date('2026-12-01T13:00:00.000Z');

    const deadline = computeDeadline(
      { dueReference: 'AUCTION_AT', dueOffsetDays: 0, dueOffsetMinutes: -60 },
      clockStart,
      { ...noBusinessDates, auctionAt },
    );

    expect(deadline.dueAt?.toISOString()).toBe('2026-12-01T12:00:00.000Z');
  });

  it('sin la fecha de negocio la tarea queda sin vencimiento', () => {
    expect(
      computeDeadline(
        { dueReference: 'BALANCE_PAYMENT_AT', dueOffsetDays: 3, dueOffsetMinutes: 0 },
        clockStart,
        noBusinessDates,
      ),
    ).toEqual({ dueReferenceAt: null, dueAt: null });
  });
});

describe('isOverdue', () => {
  it('una tarea sin vencimiento nunca está vencida', () => {
    expect(isOverdue(null, new Date())).toBe(false);
    expect(isOverdue(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z'))).toBe(
      true,
    );
  });
});
