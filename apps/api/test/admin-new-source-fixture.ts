import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { parseEnv } from '../src/config/env.js';
import {
  connectAdminNewSource,
  type AdminNewSource,
} from '../src/modules/admin-new-sync/persistence/admin-new-source.js';

// Réplica mínima de las tablas de admin_new que lee el sincronizador, con los mismos tipos que la
// copia local (ids como TEXT, fechas y montos como texto, datos_lremate en MyISAM). Vive en una
// base propia de pruebas, nunca en admin_new.
const SOURCE_TABLES = [
  `CREATE TABLE IF NOT EXISTS propiedad (
     id_propiedad INT NOT NULL PRIMARY KEY,
     nombre TEXT, ubicacion TEXT, comuna TEXT, region TEXT,
     id_clasif INT, KEY idx_clasif (id_clasif)
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS dato_propiedad (
     id_dato INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
     id_p TEXT, corte TEXT, tribunal TEXT, rol_normalizado VARCHAR(100),
     r1 TEXT, r2 TEXT, r3 TEXT, r4 TEXT, r5 TEXT,
     hora_garantia_desde TIME, hora_garantia_hasta TIME,
     KEY idx_dp_idp (id_p(20))
   ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS datos_lremate (
     id_dr INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
     idp TEXT, hora_remate TEXT
   ) ENGINE=MyISAM`,
  `CREATE TABLE IF NOT EXISTS estado_remate (
     id_er INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
     id_r TEXT NOT NULL, postor TEXT, pagador TEXT,
     KEY idx_er_idr (id_r(20))
   ) ENGINE=InnoDB`,
];

export interface SourceFixture {
  readonly source: AdminNewSource;
  readonly databaseName: string;
  givenAccepted(property: SourcePropertyInput): Promise<void>;
  setClassification(adminNewId: number, classificationId: number): Promise<void>;
  addDetailRow(adminNewId: number, detail: SourceDetailInput): Promise<void>;
  setAuctionDate(adminNewId: number, auctionDate: string): Promise<void>;
  setReferenceDates(
    adminNewId: number,
    dates: Pick<SourceDetailInput, 'r3' | 'r4' | 'r5'>,
  ): Promise<void>;
  setAuctionParticipants(
    adminNewId: number,
    bidder: string | null,
    payer: string | null,
  ): Promise<void>;
  setCommune(adminNewId: number, commune: string): Promise<void>;
  deleteProperty(adminNewId: number): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface SourceDetailInput {
  readonly r1?: string | null;
  readonly r2?: string | null;
  readonly r3?: string | null;
  readonly r4?: string | null;
  readonly r5?: string | null;
  readonly horaRemate?: string | null;
}

export interface SourcePropertyInput extends SourceDetailInput {
  readonly id: number;
  readonly name?: string;
  readonly commune?: string;
  readonly classificationId?: number;
  readonly bidder?: string | null;
  readonly payer?: string | null;
}

export async function startSourceFixture(adminPool: Pool): Promise<SourceFixture> {
  const env = parseEnv(process.env);
  const testDatabaseName = process.env.DB_TEST_NAME ?? '';
  const databaseName = `${testDatabaseName}_admin_new`;
  if (!/^[A-Za-z0-9_]+$/.test(databaseName) || databaseName === env.ADMIN_NEW_DB_NAME) {
    throw new Error('La base de origen de pruebas debe ser propia');
  }

  await adminPool.query(
    `CREATE DATABASE IF NOT EXISTS ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  for (const statement of SOURCE_TABLES) {
    await adminPool.query(statement.replace('IF NOT EXISTS ', `IF NOT EXISTS ${databaseName}.`));
  }

  const source = connectAdminNewSource({
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: databaseName,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });
  const table = (name: string) => `${databaseName}.${name}`;

  const addDetailRow = async (adminNewId: number, detail: SourceDetailInput) => {
    await adminPool.query(
      `INSERT INTO ${table('dato_propiedad')}
         (id_p, corte, tribunal, rol_normalizado, r1, r2, r3, r4, r5,
          hora_garantia_desde, hora_garantia_hasta)
       VALUES (?, 'C.A. de Santiago', '1° Juzgado Civil Sintético', 'c-0001-2026', ?, ?, ?,
               ?, ?, '09:00:00', '12:00:00')`,
      [
        String(adminNewId),
        detail.r1 === undefined ? '2026-12-07' : detail.r1,
        detail.r2 === undefined ? '8.100.000' : detail.r2,
        detail.r3 === undefined ? '2026-12-04' : detail.r3,
        detail.r4 ?? null,
        detail.r5 ?? null,
      ],
    );
  };

  return {
    source,
    databaseName,
    async givenAccepted(property) {
      await adminPool.query(
        `INSERT INTO ${table('propiedad')} (id_propiedad, nombre, ubicacion, comuna, region, id_clasif)
         VALUES (?, ?, 'Calle Sintética 123', ?, 'Región Metropolitana', ?)`,
        [
          property.id,
          property.name ?? 'Propiedad sintética',
          property.commune ?? 'Ñuñoa',
          property.classificationId ?? 7,
        ],
      );
      await addDetailRow(property.id, property);
      if (property.horaRemate !== null) {
        const [auction] = await adminPool.query<ResultSetHeader>(
          `INSERT INTO ${table('datos_lremate')} (idp, hora_remate) VALUES (?, ?)`,
          [String(property.id), property.horaRemate ?? '10:30'],
        );
        if (property.bidder !== undefined || property.payer !== undefined) {
          await adminPool.query(
            `INSERT INTO ${table('estado_remate')} (id_r, postor, pagador) VALUES (?, ?, ?)`,
            [String(auction.insertId), property.bidder ?? null, property.payer ?? null],
          );
        }
      }
    },
    async setClassification(adminNewId, classificationId) {
      await adminPool.query(
        `UPDATE ${table('propiedad')} SET id_clasif = ? WHERE id_propiedad = ?`,
        [classificationId, adminNewId],
      );
    },
    addDetailRow,
    async setAuctionDate(adminNewId, auctionDate) {
      await adminPool.query(`UPDATE ${table('dato_propiedad')} SET r1 = ? WHERE id_p = ?`, [
        auctionDate,
        String(adminNewId),
      ]);
    },
    async setReferenceDates(adminNewId, dates) {
      await adminPool.query(
        `UPDATE ${table('dato_propiedad')} SET r3 = ?, r4 = ?, r5 = ? WHERE id_p = ?`,
        [dates.r3 ?? null, dates.r4 ?? null, dates.r5 ?? null, String(adminNewId)],
      );
    },
    async setAuctionParticipants(adminNewId, bidder, payer) {
      await adminPool.query(
        `INSERT INTO ${table('estado_remate')} (id_r, postor, pagador) VALUES (?, ?, ?)`,
        [String(adminNewId), bidder, payer],
      );
    },
    async setCommune(adminNewId, commune) {
      await adminPool.query(`UPDATE ${table('propiedad')} SET comuna = ? WHERE id_propiedad = ?`, [
        commune,
        adminNewId,
      ]);
    },
    async deleteProperty(adminNewId) {
      await adminPool.query(`DELETE FROM ${table('propiedad')} WHERE id_propiedad = ?`, [
        adminNewId,
      ]);
    },
    async reset() {
      for (const name of ['propiedad', 'dato_propiedad', 'datos_lremate', 'estado_remate']) {
        await adminPool.query(`DELETE FROM ${table(name)}`);
      }
    },
    async close() {
      await source.close();
    },
  };
}
