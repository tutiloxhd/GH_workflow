// Feriados de Chile usados para contar días hábiles (ADR 0010).
export const HOLIDAY_SOURCES = ['BOOSTR', 'MANUAL'] as const;
export type HolidaySource = (typeof HOLIDAY_SOURCES)[number];

export const MAX_HOLIDAY_NAME_LENGTH = 200;
export const MIN_HOLIDAY_YEAR = 2000;
export const MAX_HOLIDAY_YEAR = 2100;

// Día «AAAA-MM-DD» del calendario de Santiago.
export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface Holiday {
  readonly date: string;
  readonly name: string;
  readonly isInalienable: boolean;
  readonly source: HolidaySource;
}

// Un feriado tal como lo entrega una fuente externa, antes de consolidarlo por día.
export interface SourceHoliday {
  readonly date: string;
  readonly name: string;
  readonly isInalienable: boolean;
}

// La fuente puede repetir un día (dos celebraciones la misma fecha): se deja una fila por día
// con los nombres unidos, irrenunciable si alguna lo es.
export function consolidateByDay(holidays: readonly SourceHoliday[]): SourceHoliday[] {
  const byDay = new Map<string, SourceHoliday>();
  for (const holiday of holidays) {
    const existing = byDay.get(holiday.date);
    byDay.set(
      holiday.date,
      existing
        ? {
            date: holiday.date,
            name: `${existing.name} / ${holiday.name}`.slice(0, MAX_HOLIDAY_NAME_LENGTH),
            isInalienable: existing.isInalienable || holiday.isInalienable,
          }
        : { ...holiday, name: holiday.name.slice(0, MAX_HOLIDAY_NAME_LENGTH) },
    );
  }
  return [...byDay.values()].sort((left, right) => left.date.localeCompare(right.date));
}
