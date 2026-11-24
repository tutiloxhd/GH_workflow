import { and, asc, between, eq, inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../../platform/database/database.js';
import { holidays } from '../../../platform/database/schema/holidays.schema.js';
import type { Holiday, SourceHoliday } from '../domain/holiday.js';

const holidayColumns = {
  date: holidays.holidayDate,
  name: holidays.name,
  isInalienable: holidays.isInalienable,
  source: holidays.source,
};

const yearRange = (year: number) => [`${String(year)}-01-01`, `${String(year)}-12-31`] as const;

export async function findHolidaysOfYear(
  executor: DatabaseExecutor,
  year: number,
): Promise<Holiday[]> {
  return executor
    .select(holidayColumns)
    .from(holidays)
    .where(between(holidays.holidayDate, ...yearRange(year)))
    .orderBy(asc(holidays.holidayDate));
}

// Todos los feriados como días «AAAA-MM-DD». Son pocas filas (~20 por año).
export async function findHolidayDayKeys(executor: DatabaseExecutor): Promise<Set<string>> {
  const rows = await executor.select({ date: holidays.holidayDate }).from(holidays);
  return new Set(rows.map((row) => row.date));
}

export async function findHoliday(
  executor: DatabaseExecutor,
  date: string,
): Promise<Holiday | undefined> {
  const [holiday] = await executor
    .select(holidayColumns)
    .from(holidays)
    .where(eq(holidays.holidayDate, date))
    .for('update');
  return holiday;
}

// Reemplaza los feriados sincronizados del año. Los ingresados a mano se conservan y tienen
// prioridad: si la fuente trae el mismo día, ese día no se toca.
export async function replaceSyncedHolidaysOfYear(
  executor: DatabaseExecutor,
  year: number,
  sourceHolidays: readonly SourceHoliday[],
  actorUserId: number,
): Promise<void> {
  await executor
    .delete(holidays)
    .where(and(between(holidays.holidayDate, ...yearRange(year)), eq(holidays.source, 'BOOSTR')));
  if (sourceHolidays.length === 0) return;

  const manualRows = await executor
    .select({ date: holidays.holidayDate })
    .from(holidays)
    .where(
      inArray(
        holidays.holidayDate,
        sourceHolidays.map((holiday) => holiday.date),
      ),
    );
  const manualDays = new Set(manualRows.map((row) => row.date));
  const rows = sourceHolidays
    .filter((holiday) => !manualDays.has(holiday.date))
    .map((holiday) => ({
      holidayDate: holiday.date,
      name: holiday.name,
      isInalienable: holiday.isInalienable,
      source: 'BOOSTR' as const,
      createdBy: actorUserId,
    }));
  if (rows.length > 0) await executor.insert(holidays).values(rows);
}

export async function insertManualHoliday(
  executor: DatabaseExecutor,
  holiday: SourceHoliday,
  actorUserId: number,
): Promise<void> {
  await executor.insert(holidays).values({
    holidayDate: holiday.date,
    name: holiday.name,
    isInalienable: holiday.isInalienable,
    source: 'MANUAL',
    createdBy: actorUserId,
  });
}

export async function deleteHoliday(executor: DatabaseExecutor, date: string): Promise<void> {
  await executor.delete(holidays).where(eq(holidays.holidayDate, date));
}
