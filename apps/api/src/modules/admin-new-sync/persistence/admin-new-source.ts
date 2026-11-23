import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type { DatabaseSettings } from '../../../platform/database/database.js';
import {
  ACCEPTED_CLASSIFICATION_ID,
  type SourceAuctionState,
  type SourceAuction,
  type SourceDetail,
  type SourceProperty,
} from '../domain/source-property.js';
import type { SourceAgentUser } from '../domain/source-agent-user.js';

// Lectura de admin_new. Es un sistema externo: aquí solo hay SELECT, y la sesión se declara de
// solo lectura para que MySQL rechace cualquier escritura aunque el usuario tuviera permisos.
export interface AdminNewSource {
  readAcceptedProperties(): Promise<SourceProperty[]>;
  readAgentUsers(): Promise<SourceAgentUser[]>;
  // Clasificación actual de las propiedades indicadas; las que ya no existen no aparecen.
  readClassifications(adminNewIds: readonly number[]): Promise<Map<number, number | null>>;
  close(): Promise<void>;
}

const CONNECTION_LIMIT = 2;
// Listas IN acotadas: dato_propiedad.id_p, datos_lremate.idp y estado_remate.id_r son TEXT,
// así que se comparan como texto para evitar conversiones de cada fila en MySQL.
const ID_BATCH_SIZE = 500;

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-CL');
}

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
  auctionMode: nullableText(raw.tipo_remate),
});

const toAuctionState = (raw: RowDataPacket): SourceAuctionState => ({
  rowId: Number(raw.id_er),
  bidder: nullableText(raw.postor),
  payer: nullableText(raw.pagador),
  bidderRut: nullableText(raw.rut_postor),
  payerRut: nullableText(raw.rut_pagador),
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
    async readAgentUsers() {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT agent.id_user,
                COALESCE(
                  NULLIF(TRIM(agent.nombre), ''),
                  NULLIF(
                    TRIM(CONCAT_WS(' ', NULLIF(TRIM(source_user.nombres), ''),
                                       NULLIF(TRIM(source_user.apellidos), ''))),
                    ''
                  )
                ) AS agent_name,
                agent.rut AS agent_rut,
                agent.region AS agent_region,
                source_user.correo AS email,
                source_user.pass AS legacy_password,
                source_user.id_gh_area AS area_id
           FROM gh_agente_zona AS agent
           INNER JOIN \u0060user\u0060 AS source_user ON source_user.id_user = agent.id_user
          WHERE agent.id_gh_agente_zona = (
            SELECT latest_agent.id_gh_agente_zona
              FROM gh_agente_zona AS latest_agent
             WHERE latest_agent.id_user = agent.id_user
             ORDER BY latest_agent.creado DESC, latest_agent.id_gh_agente_zona DESC
             LIMIT 1
          )
          ORDER BY agent.id_user`,
      );
      return rows.map((row): SourceAgentUser => ({
        adminNewUserId: Number(row.id_user),
        name: nullableText(row.agent_name),
        rut: nullableText(row.agent_rut),
        email: nullableText(row.email),
        legacyPassword: nullableText(row.legacy_password),
        areaId: row.area_id === null ? null : Number(row.area_id),
        regionName: nullableText(row.agent_region)?.replace(/\s+/g, ' ').trim() || null,
      }));
    },

    async readAcceptedProperties() {
      const [propertyRows] = await pool.query<RowDataPacket[]>(
        `SELECT id_propiedad, nombre, ubicacion, comuna, region
           FROM propiedad
          WHERE id_clasif = ?
          ORDER BY id_propiedad`,
        [ACCEPTED_CLASSIFICATION_ID],
      );
      if (propertyRows.length === 0) return [];

      const [communeRows] = await pool.query<RowDataPacket[]>(
        'SELECT comuna, region FROM gh_comuna_region',
      );
      const regionsByCommune = new Map<string, Set<string>>();
      for (const row of communeRows) {
        const commune = nullableText(row.comuna);
        const region = nullableText(row.region)?.trim();
        if (!commune || !region) continue;
        const key = normalizeLabel(commune);
        const regions = regionsByCommune.get(key) ?? new Set<string>();
        regions.add(region);
        regionsByCommune.set(key, regions);
      }

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
          `SELECT id_dr, idp, hora_remate, tipo_remate FROM datos_lremate WHERE idp IN (?)`,
          textIds,
        ),
        'idp',
        'id_dr',
        toAuction,
      );
      const auctionIds = [...auctions.values()].map(({ row }) => String(row.rowId));
      const auctionStateIds = [...new Set([...textIds, ...auctionIds])];
      const auctionStates = latestByProperty(
        await selectByIds(
          `SELECT id_er, id_r, postor, pagador, rut_postor, rut_pagador
             FROM estado_remate
            WHERE id_r IN (?)`,
          auctionStateIds,
        ),
        'id_r',
        'id_er',
        toAuctionState,
      );

      return propertyRows.map((row): SourceProperty => {
        const adminNewId = Number(row.id_propiedad);
        const detail = details.get(adminNewId);
        const auction = auctions.get(adminNewId);
        const commune = nullableText(row.comuna);
        const communeRegions = commune ? regionsByCommune.get(normalizeLabel(commune)) : undefined;
        return {
          adminNewId,
          name: nullableText(row.nombre),
          location: nullableText(row.ubicacion),
          commune,
          region: nullableText(row.region),
          assignmentRegion: communeRegions?.size === 1 ? ([...communeRegions][0] ?? null) : null,
          detail: detail?.row ?? null,
          detailRowCount: detail?.count ?? 0,
          auction: auction?.row ?? null,
          auctionRowCount: auction?.count ?? 0,
          auctionState:
            auctionStates.get(adminNewId)?.row ??
            (auction ? (auctionStates.get(auction.row.rowId)?.row ?? null) : null),
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
