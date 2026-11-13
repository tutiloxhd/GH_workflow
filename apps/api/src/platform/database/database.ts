import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool } from 'mysql2/promise';

export interface DatabaseSettings {
  readonly host: string;
  readonly port: number;
  readonly name: string;
  readonly user: string;
  readonly password: string;
}

export type DatabaseTransaction = Parameters<Parameters<MySql2Database['transaction']>[0]>[0];
// Las consultas de los repositorios aceptan la conexión normal o una transacción en curso.
export type DatabaseExecutor = MySql2Database | DatabaseTransaction;

export interface Database {
  readonly db: MySql2Database;
  readonly pool: Pool;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const CONNECTION_LIMIT = 10;

export function connectDatabase(settings: DatabaseSettings): Database {
  const pool = mysql.createPool({
    host: settings.host,
    port: settings.port,
    database: settings.name,
    user: settings.user,
    password: settings.password,
    connectionLimit: CONNECTION_LIMIT,
    timezone: 'Z',
  });

  // CURRENT_TIMESTAMP depende de la zona de la sesión: se fija en UTC antes de cualquier consulta.
  pool.pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });

  return {
    db: drizzle({ client: pool }),
    pool,
    async ping() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
}
