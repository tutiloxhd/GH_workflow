import { createHash } from 'node:crypto';
import { businessLocalToInstant } from '../../workflow/domain/due-date.js';

// Una propiedad de admin_new tal como se lee: textos sin interpretar. Las tablas hijas no tienen
// claves foráneas, así que puede haber varias filas por propiedad; se lee la de mayor id.
export interface SourceProperty {
  readonly adminNewId: number;
  readonly name: string | null; // propiedad.nombre
  readonly location: string | null; // propiedad.ubicacion
  readonly commune: string | null;
  readonly region: string | null;
  readonly assignmentRegion: string | null;
  readonly detail: SourceDetail | null; // dato_propiedad
  readonly detailRowCount: number;
  readonly auction: SourceAuction | null; // datos_lremate
  readonly auctionRowCount: number;
  readonly auctionState: SourceAuctionState | null; // estado_remate, para datos_lremate.id_dr
}

export interface SourceDetail {
  readonly rowId: number; // id_dato
  readonly court: string | null; // corte
  readonly tribunal: string | null;
  readonly caseReference: string | null; // rol_normalizado
  readonly auctionDate: string | null; // r1
  readonly guaranteeAmount: string | null; // r2
  readonly guaranteePaymentDate: string | null; // r3
  readonly guaranteeReturnDate: string | null; // r4
  readonly balancePaymentDate: string | null; // r5
  readonly guaranteeWindowStart: string | null; // hora_garantia_desde (TIME)
  readonly guaranteeWindowEnd: string | null; // hora_garantia_hasta (TIME)
}

export interface SourceAuction {
  readonly rowId: number; // id_dr
  readonly auctionTime: string | null; // hora_remate
  readonly auctionMode: string | null;
}

export interface SourceAuctionState {
  readonly rowId: number; // id_er
  readonly bidder: string | null; // postor
  readonly payer: string | null; // pagador (gestor)
  readonly bidderRut?: string | null;
  readonly payerRut?: string | null;
}

// Valores ya interpretados, con la forma de la tabla `properties`.
export interface PropertySnapshot {
  readonly title: string | null;
  readonly address: string | null;
  readonly commune: string | null;
  readonly region: string | null;
  readonly assignmentRegion: string | null;
  readonly auctionMode: string | null;
  readonly court: string | null;
  readonly tribunal: string | null;
  readonly caseReference: string | null;
  readonly auctionBidderName: string | null;
  readonly auctionPayerName: string | null;
  readonly auctionAt: Date | null;
  readonly guaranteeAmount: string | null;
  readonly guaranteePaymentAt: Date | null;
  readonly guaranteeWindowStart: string | null;
  readonly guaranteeWindowEnd: string | null;
  readonly guaranteeReturnAt: Date | null;
  readonly balancePaymentAt: Date | null;
}

export const SOURCE_ISSUE_CODES = [
  'MISSING_DETAIL_ROW',
  'DUPLICATE_DETAIL_ROWS',
  'DUPLICATE_AUCTION_ROWS',
  'MISSING_AUCTION_DATE',
  'MISSING_AUCTION_TIME',
  'INVALID_DATE',
  'INVALID_TIME',
  'INVALID_AMOUNT',
  'VALUE_TRUNCATED',
  'UNMAPPED_ASSIGNMENT_REGION',
] as const;
export type SourceIssueCode = (typeof SOURCE_ISSUE_CODES)[number];

export interface SourceIssue {
  readonly code: SourceIssueCode;
  readonly message: string;
}

export interface NormalizedProperty {
  readonly snapshot: PropertySnapshot;
  readonly issues: readonly SourceIssue[];
  // SHA-256 de los valores de origen: si no cambia, la propiedad no se vuelve a procesar.
  readonly sourceHash: string;
}

// Las propiedades sintéticas de desarrollo usan ids sobre este valor; nunca existen en admin_new.
export const SYNTHETIC_ADMIN_NEW_ID_FLOOR = 9_000_000_000;
export const ACCEPTED_CLASSIFICATION_ID = 7;

// Largo de las columnas de `properties`.
const TEXT_LIMITS = {
  title: 255,
  address: 255,
  commune: 100,
  region: 100,
  court: 150,
  tribunal: 150,
  caseReference: 100,
} as const;

const MAX_QUOTED_VALUE_LENGTH = 40;
const quote = (value: string) => `«${value.slice(0, MAX_QUOTED_VALUE_LENGTH)}»`;

const clean = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

// admin_new guarda fechas como texto «AAAA-MM-DD» (confirmado con una muestra de la copia local).
export function parseSourceDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return isRealDate ? { year, month, day } : null;
}

// Horas vistas en el origen: «09:00», «9:30», «11.30» y columnas TIME «09:00:00».
export function parseSourceTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

const MAX_AMOUNT_INTEGER_DIGITS = 16; // DECIMAL(18,2)

// Montos en pesos con puntos de miles («8.100.000»), opcionalmente con «$» y decimales con coma.
export function parseClpAmount(value: string): string | null {
  const compact = value.replace(/^\$\s*/, '').replace(/\s/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(compact);
  if (!match?.[1]) return null;
  const integerPart = match[1].replaceAll('.', '').replace(/^0+(?=\d)/, '');
  if (integerPart.length > MAX_AMOUNT_INTEGER_DIGITS) return null;
  return `${integerPart}.${(match[2] ?? '').padEnd(2, '0')}`;
}

const formatTime = (time: { hour: number; minute: number }) =>
  `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:00`;

export function normalizeSourceProperty(source: SourceProperty): NormalizedProperty {
  const issues: SourceIssue[] = [];
  const report = (code: SourceIssueCode, message: string) => issues.push({ code, message });

  const text = (value: string | null, field: keyof typeof TEXT_LIMITS, label: string) => {
    const cleaned = clean(value);
    const limit = TEXT_LIMITS[field];
    if (cleaned === null || cleaned.length <= limit) return cleaned;
    report('VALUE_TRUNCATED', `${label} supera ${String(limit)} caracteres y se recortó`);
    return cleaned.slice(0, limit);
  };

  const date = (value: string | null, column: string): CalendarDate | null => {
    const cleaned = clean(value);
    if (cleaned === null) return null;
    const parsed = parseSourceDate(cleaned);
    if (!parsed) report('INVALID_DATE', `${column} ${quote(cleaned)} no es una fecha AAAA-MM-DD`);
    return parsed;
  };

  const time = (value: string | null, column: string) => {
    const cleaned = clean(value);
    if (cleaned === null) return null;
    const parsed = parseSourceTime(cleaned);
    if (!parsed) report('INVALID_TIME', `${column} ${quote(cleaned)} no es una hora válida`);
    return parsed;
  };

  const { detail, auction } = source;
  if (!detail) report('MISSING_DETAIL_ROW', 'La propiedad no tiene fila en dato_propiedad');
  if (detail && source.detailRowCount > 1) {
    report(
      'DUPLICATE_DETAIL_ROWS',
      `${String(source.detailRowCount)} filas en dato_propiedad; se usa id_dato ${String(detail.rowId)}`,
    );
  }
  if (auction && source.auctionRowCount > 1) {
    report(
      'DUPLICATE_AUCTION_ROWS',
      `${String(source.auctionRowCount)} filas en datos_lremate; se usa id_dr ${String(auction.rowId)}`,
    );
  }

  const auctionDate = date(detail?.auctionDate ?? null, 'r1');
  const auctionTime = time(auction?.auctionTime ?? null, 'hora_remate');
  if (detail && clean(detail.auctionDate) === null) {
    report('MISSING_AUCTION_DATE', 'r1 (fecha del remate) está vacío');
  }
  if (auctionDate && !auctionTime && clean(auction?.auctionTime ?? null) === null) {
    report('MISSING_AUCTION_TIME', 'hora_remate está vacía; se usa 00:00');
  }

  const rawAmount = clean(detail?.guaranteeAmount ?? null);
  const guaranteeAmount = rawAmount === null ? null : parseClpAmount(rawAmount);
  if (rawAmount !== null && guaranteeAmount === null) {
    report('INVALID_AMOUNT', `r2 ${quote(rawAmount)} no es un monto en pesos`);
  }

  const windowStart = time(detail?.guaranteeWindowStart ?? null, 'hora_garantia_desde');
  const windowEnd = time(detail?.guaranteeWindowEnd ?? null, 'hora_garantia_hasta');
  const guaranteePaymentDate = date(detail?.guaranteePaymentDate ?? null, 'r3');
  const guaranteeReturnDate = date(detail?.guaranteeReturnDate ?? null, 'r4');
  const balancePaymentDate = date(detail?.balancePaymentDate ?? null, 'r5');
  const assignmentRegion = clean(source.assignmentRegion);
  if (!assignmentRegion) {
    report(
      'UNMAPPED_ASSIGNMENT_REGION',
      'No se pudo determinar la región de la propiedad desde su comuna',
    );
  }

  const snapshot: PropertySnapshot = {
    title: text(source.name, 'title', 'nombre'),
    address: text(source.location, 'address', 'ubicacion'),
    commune: text(source.commune, 'commune', 'comuna'),
    region: text(source.region, 'region', 'region'),
    assignmentRegion,
    auctionMode: clean(auction?.auctionMode ?? null),
    court: text(detail?.court ?? null, 'court', 'corte'),
    tribunal: text(detail?.tribunal ?? null, 'tribunal', 'tribunal'),
    caseReference: text(detail?.caseReference ?? null, 'caseReference', 'rol_normalizado'),
    auctionBidderName: clean(source.auctionState?.bidder ?? null),
    auctionPayerName: clean(source.auctionState?.payer ?? null),
    // Sin hora conocida se toma 00:00 de Santiago: los plazos medidos desde el remate quedan
    // en el lado seguro (más temprano).
    auctionAt: auctionDate && businessLocalToInstant(auctionDate, auctionTime ?? undefined),
    guaranteeAmount,
    // Vencimiento de la garantía: r3 al cierre del horario de pago, si se conoce.
    guaranteePaymentAt:
      guaranteePaymentDate && businessLocalToInstant(guaranteePaymentDate, windowEnd ?? undefined),
    guaranteeWindowStart: windowStart && formatTime(windowStart),
    guaranteeWindowEnd: windowEnd && formatTime(windowEnd),
    guaranteeReturnAt: guaranteeReturnDate && businessLocalToInstant(guaranteeReturnDate),
    balancePaymentAt: balancePaymentDate && businessLocalToInstant(balancePaymentDate),
  };

  return {
    snapshot,
    issues,
    sourceHash: hashSource(source),
  };
}

// El hash usa los valores tal como vienen del origen y los ids de fila elegidos, para que un
// cambio de cualquier valor leído (o de la fila vigente) se detecte.
function hashSource(source: SourceProperty): string {
  const { detail, auction } = source;
  const values = [
    source.adminNewId,
    source.name,
    source.location,
    source.commune,
    source.region,
    source.assignmentRegion,
    detail?.rowId ?? null,
    detail?.court ?? null,
    detail?.tribunal ?? null,
    detail?.caseReference ?? null,
    detail?.auctionDate ?? null,
    detail?.guaranteeAmount ?? null,
    detail?.guaranteePaymentDate ?? null,
    detail?.guaranteeReturnDate ?? null,
    detail?.balancePaymentDate ?? null,
    detail?.guaranteeWindowStart ?? null,
    detail?.guaranteeWindowEnd ?? null,
    auction?.rowId ?? null,
    auction?.auctionTime ?? null,
    auction?.auctionMode ?? null,
    source.auctionState?.rowId ?? null,
    source.auctionState?.bidder ?? null,
    source.auctionState?.payer ?? null,
  ];
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

// Fechas de referencia de los plazos: un cambio en ellas reprograma el workflow (sprint 5).
export const REFERENCE_DATE_FIELDS = [
  'auctionAt',
  'guaranteePaymentAt',
  'guaranteeReturnAt',
  'balancePaymentAt',
] as const;
export type ReferenceDateField = (typeof REFERENCE_DATE_FIELDS)[number];
export type ReferenceDates = Readonly<Record<ReferenceDateField, Date | null>>;

export const isReferenceDateField = (field: string): field is ReferenceDateField =>
  (REFERENCE_DATE_FIELDS as readonly string[]).includes(field);

type SnapshotValue = PropertySnapshot[keyof PropertySnapshot];

const comparable = (value: SnapshotValue): string | number | null =>
  value instanceof Date ? value.getTime() : value;

const SNAPSHOT_FIELDS: readonly (keyof PropertySnapshot)[] = [
  'title',
  'address',
  'commune',
  'region',
  'assignmentRegion',
  'auctionMode',
  'court',
  'tribunal',
  'caseReference',
  'auctionBidderName',
  'auctionPayerName',
  'auctionAt',
  'guaranteeAmount',
  'guaranteePaymentAt',
  'guaranteeWindowStart',
  'guaranteeWindowEnd',
  'guaranteeReturnAt',
  'balancePaymentAt',
];

export function changedSnapshotFields(
  stored: PropertySnapshot,
  incoming: PropertySnapshot,
): (keyof PropertySnapshot)[] {
  return SNAPSHOT_FIELDS.filter(
    (field) => comparable(stored[field]) !== comparable(incoming[field]),
  );
}

// Valores de los campos indicados en forma serializable para property_source_changes.
export function pickSnapshotValues(
  snapshot: PropertySnapshot,
  fields: readonly (keyof PropertySnapshot)[],
): Record<string, string | null> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = snapshot[field];
      return [field, value instanceof Date ? value.toISOString() : value];
    }),
  );
}

export const referenceDatesOf = (snapshot: PropertySnapshot): ReferenceDates => ({
  auctionAt: snapshot.auctionAt,
  guaranteePaymentAt: snapshot.guaranteePaymentAt,
  guaranteeReturnAt: snapshot.guaranteeReturnAt,
  balancePaymentAt: snapshot.balancePaymentAt,
});
