import { isDuplicateEntryError } from '../../../platform/database/database-errors.js';
import { logger } from '../../../platform/logging/logger.js';
import { fail, succeed, type Result } from '../../../platform/result.js';
import type { WorkflowDependencies } from '../../workflow/application/workflow-dependencies.js';
import { isAdmin, type Actor } from '../../workflow/domain/task-rules.js';
import { consolidateByDay, type Holiday, type SourceHoliday } from '../domain/holiday.js';
import {
  deleteHoliday,
  findHoliday,
  findHolidaysOfYear,
  insertManualHoliday,
  replaceSyncedHolidaysOfYear,
} from '../persistence/holidays-repository.js';
import type { HolidayProvider } from '../source/holiday-provider.js';

export interface HolidayDependencies extends WorkflowDependencies {
  // null si el entorno no tiene fuente externa (p. ej., otro entrypoint): solo ingreso manual.
  readonly holidayProvider: HolidayProvider | null;
}

export type HolidayFailure =
  | 'FORBIDDEN'
  | 'HOLIDAY_SOURCE_NOT_CONFIGURED'
  | 'HOLIDAY_SOURCE_UNAVAILABLE'
  | 'HOLIDAY_EXISTS'
  | 'HOLIDAY_NOT_FOUND';

export interface HolidayYear {
  readonly year: number;
  readonly holidays: readonly Holiday[];
  readonly canSync: boolean;
}

export async function listHolidays(
  dependencies: HolidayDependencies,
  year: number,
): Promise<HolidayYear> {
  return {
    year,
    holidays: await findHolidaysOfYear(dependencies.database.db, year),
    canSync: dependencies.holidayProvider !== null,
  };
}

export async function syncHolidays(
  dependencies: HolidayDependencies,
  actor: Actor,
  year: number,
): Promise<Result<{ synced: number }, HolidayFailure>> {
  if (!isAdmin(actor)) return fail('FORBIDDEN');
  if (!dependencies.holidayProvider) return fail('HOLIDAY_SOURCE_NOT_CONFIGURED');

  const fetched = await dependencies.holidayProvider.fetchYear(year);
  if (!fetched) return fail('HOLIDAY_SOURCE_UNAVAILABLE');
  const holidays = consolidateByDay(fetched);
  await dependencies.database.db.transaction((transaction) =>
    replaceSyncedHolidaysOfYear(transaction, year, holidays, actor.id),
  );
  logger.info('holidays.synced', { year, count: holidays.length, actorUserId: actor.id });
  return succeed({ synced: holidays.length });
}

export async function addHoliday(
  dependencies: HolidayDependencies,
  actor: Actor,
  holiday: SourceHoliday,
): Promise<Result<null, HolidayFailure>> {
  if (!isAdmin(actor)) return fail('FORBIDDEN');
  try {
    await insertManualHoliday(dependencies.database.db, holiday, actor.id);
  } catch (error) {
    if (isDuplicateEntryError(error)) return fail('HOLIDAY_EXISTS');
    throw error;
  }
  logger.info('holidays.added', { date: holiday.date, actorUserId: actor.id });
  return succeed(null);
}

export async function removeHoliday(
  dependencies: HolidayDependencies,
  actor: Actor,
  date: string,
): Promise<Result<null, HolidayFailure>> {
  if (!isAdmin(actor)) return fail('FORBIDDEN');
  const removed = await dependencies.database.db.transaction(async (transaction) => {
    if (!(await findHoliday(transaction, date))) return false;
    await deleteHoliday(transaction, date);
    return true;
  });
  if (!removed) return fail('HOLIDAY_NOT_FOUND');
  logger.info('holidays.removed', { date, actorUserId: actor.id });
  return succeed(null);
}
