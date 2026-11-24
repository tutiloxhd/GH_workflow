import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { HOLIDAY_SOURCES } from '../../../modules/holidays/domain/holiday.js';
import { createdAt, primaryId, referenceId, updatedAt } from './columns.js';
import { users } from './identity.schema.js';

// Feriados de Chile; un día por fila. Los días se guardan como fecha sin hora (calendario de
// Santiago) y se usan para contar plazos en días hábiles.
export const holidays = mysqlTable(
  'holidays',
  {
    id: primaryId(),
    holidayDate: date('holiday_date', { mode: 'string' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    isInalienable: boolean('is_inalienable').notNull().default(false),
    source: varchar('source', { length: 20, enum: HOLIDAY_SOURCES }).notNull(),
    createdBy: referenceId('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_holidays_date').on(table.holidayDate),
    foreignKey({
      name: 'fk_holidays_creator',
      columns: [table.createdBy],
      foreignColumns: [users.id],
    }),
    check('chk_holidays_source', sql`${table.source} IN ('BOOSTR', 'MANUAL')`),
  ],
);
