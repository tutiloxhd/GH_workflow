import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { DatabaseSettings } from '../../../platform/database/database.js';
import {
  ACCEPTED_CLASSIFICATION_ID,
  type SourceAuction,
  type SourceDetail,
  type SourceProperty,
} from '../domain/source-property.js';

// Lectura de admin_new. Es un sistema externo: aquí solo hay SELECT, y la sesión se declara de
// solo lectura para que MySQL rechace cualquier escritura aunque el usuario tuviera permisos.
export interface AdminNewSource {
  readAcceptedProperties(): Promise<SourceProperty[]>;
  // Clasificación actual de las propiedades indicadas; las que ya no existen no aparecen.
  readClassifications(adminNewIds: readonly number[]): Promise<Map<number, number | null>>;
  close(): Promise<void>;
}

const CONNECTION_LIMIT = 2;
// Listas IN acotadas: dato_propiedad.id_p y datos_lremate.idp son TEXT, así que se comparan
// como texto (comparar TEXT con INT obliga a MySQL a recorrer la tabla convirtiendo cada fila).
const ID_BATCH_SIZE = 500;

function chunks<Item>(items: readonly Item[], size: number): Item[][] {
  const result: Item[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

function nullableText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return null;
}

interface LatestRow<Row> {
  readonly row: Row;
  readonly count: number;
}

// Agrupa filas hijas por id de propiedad conservando la de mayor id (criterio aprobado, ADR 0007).
function latestByProperty<Row>(
  rows: readonly RowDataPacket[],
  propertyKey: string,
  rowIdKey: string,
  toRow: (raw: RowDataPacket) => Row,
): Map<number, LatestRow<Row>> {
  const latest = new Map<number, LatestRow<Row> & { rowId: number }>();
  for (const raw of rows) {
    const propertyId = Number(String(raw[propertyKey]).trim());
    const rowId = Number(raw[rowIdKey]);
    const current = latest.get(propertyId);
    if (!current) {
      latest.set(propertyId, { row: toRow(raw), count: 1, rowId });
    } else {
      latest.set(
        propertyId,
        rowId > current.rowId
          ? { row: toRow(raw), count: current.count + 1, rowId }
          : { ...current, count: current.count + 1 },
      );
    }
  }
  return latest;
}

const toDetail = (raw: RowDataPacket): SourceDetail => ({
  rowId: Number(raw.id_dato),
  court: nullableText(raw.corte),
  tribunal: nullableText(raw.tribunal),
  caseReference: nullableText(raw.rol_normalizado),
  auctionDate: nullableText(raw.r1),
  guaranteeAmount: nullableText(raw.r2),
  guaranteePaymentDate: nullableText(raw.r3),
  guaranteeReturnDate: nullableText(raw.r4),
  balancePaymentDate: nullableText(raw.r5),
  guaranteeWindowStart: nullableText(raw.hora_garantia_desde),
  guaranteeWindowEnd: nullableText(raw.hora_garantia_hasta),
});

const toAuction = (raw: RowDataPacket): SourceAuction => ({
  rowId: Number(raw.id_dr),
  auctionTime: nullableText(raw.hora_remate),
});

export function connectAdminNewSource(settings: DatabaseSettings): AdminNewSource {
  const pool: Pool = mysql.createPool({
    host: settings.host,
    port: settings.port,
    database: settings.name,
    user: settings.user,
    password: settings.password,
    connectionLimit: CONNECTION_LIMIT,
    // TIME y DATETIME se leen como texto: el adaptador los interpreta y valida.
    dateStrings: true,
  });
  pool.pool.on('connection', (connection) => {
    connection.query('SET SESSION TRANSACTION READ ONLY');
  });

  async function selectByIds(statement: string, ids: readonly string[]): Promise<RowDataPacket[]> {
    const rows: RowDataPacket[] = [];
    for (const batch of chunks(ids, ID_BATCH_SIZE)) {
      const [batchRows] = await pool.query<RowDataPacket[]>(statement, [batch]);
      rows.push(...batchRows);
    }
    return rows;
  }

  return {
    async readAcceptedProperties() {
      const [propertyRows] = await pool.query<RowDataPacket[]>(
        `SELECT id_propiedad, nombre, ubicacion, comuna, region
           FROM propiedad
          WHERE id_clasif = ?
          ORDER BY id_propiedad`,
        [ACCEPTED_CLASSIFICATION_ID],
      );
      if (propertyRows.length === 0) return [];

      const textIds = propertyRows.map((row) => String(row.id_propiedad));
      const details = latestByProperty(
        await selectByIds(
          `SELECT id_dato, id_p, corte, tribunal, rol_normalizado, r1, r2, r3, r4, r5,
                  hora_garantia_desde, hora_garantia_hasta
             FROM dato_propiedad
            WHERE id_p IN (?)`,
          textIds,
        ),
        'id_p',
        'id_dato',
        toDetail,
      );
      const auctions = latestByProperty(
        await selectByIds(
          `SELECT id_dr, idp, hora_remate FROM datos_lremate WHERE idp IN (?)`,
          textIds,
        ),
        'idp',
        'id_dr',
        toAuction,
      );

      return propertyRows.map((row): SourceProperty => {
        const adminNewId = Number(row.id_propiedad);
        const detail = details.get(adminNewId);
        const auction = auctions.get(adminNewId);
        return {
          adminNewId,
          name: nullableText(row.nombre),
          location: nullableText(row.ubicacion),
          commune: nullableText(row.comuna),
          region: nullableText(row.region),
          detail: detail?.row ?? null,
          detailRowCount: detail?.count ?? 0,
          auction: auction?.row ?? null,
          auctionRowCount: auction?.count ?? 0,
        };
      });
    },

    async readClassifications(adminNewIds) {
      const classifications = new Map<number, number | null>();
      for (const batch of chunks(adminNewIds, ID_BATCH_SIZE)) {
        const [rows] = await pool.query<RowDataPacket[]>(
          'SELECT id_propiedad, id_clasif FROM propiedad WHERE id_propiedad IN (?)',
          [batch],
        );
        for (const row of rows) {
          classifications.set(
            Number(row.id_propiedad),
            row.id_clasif === null ? null : Number(row.id_clasif),
          );
        }
      }
      return classifications;
    },

    async close() {
      await pool.end();
    },
  };
}
