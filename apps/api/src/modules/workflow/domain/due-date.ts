// Cálculo de vencimientos. Los días se cuentan en el calendario de America/Santiago conservando
// la hora local, porque un día no siempre dura 24 horas (cambios de horario).
export const BUSINESS_TIME_ZONE = 'America/Santiago';

export const DUE_REFERENCES = [
  'TASK_ACTIVATED_AT',
  'AUCTION_AT',
  'GUARANTEE_PAYMENT_AT',
  'GUARANTEE_RETURN_AT',
  'BALANCE_PAYMENT_AT',
] as const;
export type DueReference = (typeof DUE_REFERENCES)[number];

// Plazo provisorio aprobado para todas las tareas mientras negocio define los definitivos.
export const DEFAULT_DUE_OFFSET_DAYS = 3;

export interface DeadlineRule {
  readonly dueReference: DueReference;
  readonly dueOffsetDays: number;
  readonly dueOffsetMinutes: number;
}

// Fechas de negocio de la propiedad; null cuando el origen no las informa.
export interface BusinessDates {
  readonly auctionAt: Date | null;
  readonly guaranteePaymentAt: Date | null;
  readonly guaranteeReturnAt: Date | null;
  readonly balancePaymentAt: Date | null;
}

const MILLISECONDS_PER_MINUTE = 60_000;

const localPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

interface LocalDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

function toLocal(instant: Date): LocalDateTime {
  const parts = Object.fromEntries(
    localPartsFormatter.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
    millisecond: instant.getUTCMilliseconds(),
  };
}

const wallClockAsUtc = (local: LocalDateTime): number =>
  Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
    local.millisecond,
  );

// Convierte una hora local de Santiago a instante UTC. Una hora que no existe por el adelanto
// del reloj se desplaza hacia adelante, como hace el propio reloj.
function fromLocal(local: LocalDateTime): Date {
  const target = wallClockAsUtc(local);
  let candidate = target;
  for (let iteration = 0; iteration < 3; iteration++) {
    const offset = wallClockAsUtc(toLocal(new Date(candidate))) - candidate;
    candidate = target - offset;
  }
  return new Date(candidate);
}

// Fecha y hora de pared en Santiago → instante UTC (p. ej., fechas de admin_new guardadas sin zona).
export function businessLocalToInstant(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number } = { hour: 0, minute: 0 },
): Date {
  return fromLocal({ ...date, ...time, second: 0, millisecond: 0 });
}

// Día calendario en Santiago como «AAAA-MM-DD»; ordenable como texto.
export function businessDayKey(instant: Date): string {
  const local = toLocal(instant);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(local.year)}-${pad(local.month)}-${pad(local.day)}`;
}

export function addBusinessCalendarDays(instant: Date, days: number): Date {
  const local = toLocal(instant);
  const shiftedDate = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return fromLocal({
    ...local,
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth() + 1,
    day: shiftedDate.getUTCDate(),
  });
}

// Cómo se cuentan los días de un plazo. Lo fija la versión de la plantilla del workflow:
// las versiones heredadas cuentan días corridos y las nuevas, días hábiles (ADR 0010).
export const DEADLINE_DAY_KINDS = ['CALENDAR', 'BUSINESS'] as const;
export type DeadlineDayKind = (typeof DEADLINE_DAY_KINDS)[number];

export type DeadlineCalendar =
  | { readonly dayKind: 'CALENDAR' }
  // `holidays` son días «AAAA-MM-DD» de Santiago que no cuentan como hábiles.
  | { readonly dayKind: 'BUSINESS'; readonly holidays: ReadonlySet<string> };

export const CALENDAR_DAYS: DeadlineCalendar = { dayKind: 'CALENDAR' };

const SATURDAY = 6;
const SUNDAY = 0;

// Día hábil: de lunes a viernes y no feriado, según el calendario de Santiago.
export function isBusinessDay(dayKey: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  return weekday !== SATURDAY && weekday !== SUNDAY && !holidays.has(dayKey);
}

// Avanza (o retrocede, si `days` es negativo) la cantidad de días hábiles indicada, conservando la
// hora local. Con 0 días la fecha no se mueve aunque caiga en un día inhábil.
export function addBusinessDays(
  instant: Date,
  days: number,
  holidays: ReadonlySet<string>,
): Date {
  const step = Math.sign(days);
  let remaining = Math.abs(days);
  let shifted = instant;
  while (remaining > 0) {
    shifted = addBusinessCalendarDays(shifted, step);
    if (isBusinessDay(businessDayKey(shifted), holidays)) remaining--;
  }
  return shifted;
}

export function applyDeadlineRule(
  referenceAt: Date,
  rule: DeadlineRule,
  calendar: DeadlineCalendar = CALENDAR_DAYS,
): Date {
  const shifted =
    calendar.dayKind === 'BUSINESS'
      ? addBusinessDays(referenceAt, rule.dueOffsetDays, calendar.holidays)
      : addBusinessCalendarDays(referenceAt, rule.dueOffsetDays);
  return new Date(shifted.getTime() + rule.dueOffsetMinutes * MILLISECONDS_PER_MINUTE);
}

const BUSINESS_DATE_BY_REFERENCE: Readonly<
  Record<Exclude<DueReference, 'TASK_ACTIVATED_AT'>, keyof BusinessDates>
> = {
  AUCTION_AT: 'auctionAt',
  GUARANTEE_PAYMENT_AT: 'guaranteePaymentAt',
  GUARANTEE_RETURN_AT: 'guaranteeReturnAt',
  BALANCE_PAYMENT_AT: 'balancePaymentAt',
};

export interface ComputedDeadline {
  // Instante desde el que se midió el plazo; null si la fecha de negocio falta.
  readonly dueReferenceAt: Date | null;
  readonly dueAt: Date | null;
}

// `clockStart` es el instante desde el que corre un plazo medido desde la activación:
// la activación misma o, al reprogramar o reanudar, el momento de ese cambio.
export function computeDeadline(
  rule: DeadlineRule,
  clockStart: Date,
  businessDates: BusinessDates,
  calendar: DeadlineCalendar = CALENDAR_DAYS,
): ComputedDeadline {
  const referenceAt =
    rule.dueReference === 'TASK_ACTIVATED_AT'
      ? clockStart
      : businessDates[BUSINESS_DATE_BY_REFERENCE[rule.dueReference]];
  // Sin fecha de referencia la tarea queda sin vencimiento: no se inventa una fecha.
  if (!referenceAt) return { dueReferenceAt: null, dueAt: null };
  return { dueReferenceAt: referenceAt, dueAt: applyDeadlineRule(referenceAt, rule, calendar) };
}

export const isOverdue = (dueAt: Date | null, now: Date): boolean =>
  dueAt !== null && dueAt.getTime() < now.getTime();
