import { sql } from 'drizzle-orm';
import { bigint, datetime } from 'drizzle-orm/mysql-core';

// Todas las fechas se guardan como instantes UTC con precisión de microsegundos.
const CURRENT_UTC_TIMESTAMP = sql`CURRENT_TIMESTAMP(6)`;

export const primaryId = () =>
  bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey();

export const referenceId = (columnName: string) =>
  bigint(columnName, { mode: 'number', unsigned: true });

export const utcDateTime = (columnName: string) => datetime(columnName, { mode: 'date', fsp: 6 });

export const createdAt = (columnName = 'created_at') =>
  utcDateTime(columnName).notNull().default(CURRENT_UTC_TIMESTAMP);

// El valor lo renueva la aplicación en cada UPDATE hecho a través de Drizzle.
export const updatedAt = () =>
  utcDateTime('updated_at')
    .notNull()
    .default(CURRENT_UTC_TIMESTAMP)
    .$onUpdate(() => new Date());
