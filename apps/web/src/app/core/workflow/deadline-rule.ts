import type { DueReference } from './workflow.model';

// Regla de plazo: referencia + días (negativos = antes) + minutos de ajuste.
export interface DeadlineRule {
  readonly dueReference: DueReference;
  readonly dueOffsetDays: number;
  readonly dueOffsetMinutes: number;
}

// Corridos (versiones heredadas) o hábiles: lunes a viernes sin feriados.
export type DeadlineDayKind = 'CALENDAR' | 'BUSINESS';

export const MAX_OFFSET_DAYS = 365;
const MINUTES_PER_HOUR = 60;

// Referencia con la preposición ya contraída («del pago», «de la fecha»).
export const DUE_REFERENCE_PHRASES: Readonly<Record<DueReference, string>> = {
  TASK_ACTIVATED_AT: 'de que se activa la tarea',
  AUCTION_AT: 'de la fecha del remate',
  GUARANTEE_PAYMENT_AT: 'del pago de la garantía',
  GUARANTEE_RETURN_AT: 'de la devolución de la garantía',
  BALANCE_PAYMENT_AT: 'del pago del saldo',
};

// Texto corto para las opciones de un select («el remate», «el pago del saldo»).
export const DUE_REFERENCE_SHORT_LABELS: Readonly<Record<DueReference, string>> = {
  TASK_ACTIVATED_AT: 'que se activa la tarea',
  AUCTION_AT: 'la fecha del remate',
  GUARANTEE_PAYMENT_AT: 'el pago de la garantía',
  GUARANTEE_RETURN_AT: 'la devolución de la garantía',
  BALANCE_PAYMENT_AT: 'el pago del saldo',
};

export function dayUnit(days: number, dayKind: DeadlineDayKind): string {
  const plural = Math.abs(days) !== 1;
  if (dayKind === 'BUSINESS') return plural ? 'días hábiles' : 'día hábil';
  return plural ? 'días corridos' : 'día corrido';
}

function hoursText(minutes: number): string {
  if (minutes === 0) return '';
  const hours = Math.abs(minutes) / MINUTES_PER_HOUR;
  const amount = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',');
  return `, ${minutes > 0 ? 'más' : 'menos'} ${amount} h`;
}

// «Vence 3 días hábiles antes de la fecha del remate».
export function describeDeadline(rule: DeadlineRule, dayKind: DeadlineDayKind): string {
  const days = rule.dueOffsetDays;
  const reference = DUE_REFERENCE_PHRASES[rule.dueReference];
  const when =
    days === 0
      ? `el mismo día ${rule.dueReference === 'TASK_ACTIVATED_AT' ? 'en que se activa la tarea' : reference}`
      : `${String(Math.abs(days))} ${dayUnit(days, dayKind)} ${days < 0 ? 'antes' : 'después'} ${reference}`;
  return `Vence ${when}${hoursText(rule.dueOffsetMinutes)}`;
}
