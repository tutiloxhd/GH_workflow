import { formatDateTime } from '../time/santiago-time';

// Tipos de la API de sincronización (apps/api/openapi.yaml, /api/sync).
export type SyncExecutionStatus = 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
export type SyncCursorStatus = 'NEVER_RUN' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type SourceChangeType =
  'PROPERTY_ACCEPTED' | 'AUCTION_DATE_CHANGED' | 'PROPERTY_DATA_CHANGED' | 'NO_LONGER_ACCEPTED';
export type SourceChangeStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED';

export interface SyncCursor {
  readonly lastStatus: SyncCursorStatus;
  readonly lastStartedAt: string | null;
  readonly lastCompletedAt: string | null;
  readonly lastSourceId: number | null;
  readonly lastError: string | null;
}

export interface SyncExecution {
  readonly id: number;
  readonly status: SyncExecutionStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly recordsRead: number;
  readonly recordsCreated: number;
  readonly recordsUpdated: number;
  readonly workflowsStarted: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly errorMessage: string | null;
}

export interface SyncStatus {
  readonly cursor: SyncCursor | null;
  readonly executions: readonly SyncExecution[];
}

export interface SyncIssue {
  readonly id: number;
  readonly adminNewId: number | null;
  readonly severity: 'WARNING' | 'ERROR';
  readonly code: string;
  readonly message: string;
}

export interface SourceChange {
  readonly id: number;
  readonly propertyId: number;
  readonly adminNewId: number;
  readonly propertyTitle: string | null;
  readonly workflowId: number | null;
  readonly changeType: SourceChangeType;
  readonly status: SourceChangeStatus;
  readonly previousValues: Readonly<Record<string, unknown>> | null;
  readonly currentValues: Readonly<Record<string, unknown>> | null;
  readonly errorMessage: string | null;
  readonly detectedAt: string;
  readonly processedAt: string | null;
}

export const SYNC_STATUS_LABELS: Readonly<Record<SyncExecutionStatus | SyncCursorStatus, string>> =
  {
    NEVER_RUN: 'Sin ejecuciones',
    RUNNING: 'En curso',
    SUCCEEDED: 'Correcta',
    PARTIAL: 'Con errores',
    FAILED: 'Fallida',
  };

export const SYNC_STATUS_TONES: Readonly<Record<SyncExecutionStatus | SyncCursorStatus, string>> = {
  NEVER_RUN: 'neutral',
  RUNNING: 'info',
  SUCCEEDED: 'good',
  PARTIAL: 'alert',
  FAILED: 'late',
};

export const CHANGE_TYPE_LABELS: Readonly<Record<SourceChangeType, string>> = {
  PROPERTY_ACCEPTED: 'Propiedad aceptada',
  AUCTION_DATE_CHANGED: 'Cambio de fechas',
  PROPERTY_DATA_CHANGED: 'Cambio de datos',
  NO_LONGER_ACCEPTED: 'Ya no está aceptada',
};

export const CHANGE_STATUS_LABELS: Readonly<Record<SourceChangeStatus, string>> = {
  PENDING: 'Pendiente',
  PROCESSING: 'Procesando',
  PROCESSED: 'Procesado',
  FAILED: 'Fallido',
  IGNORED: 'Sin workflow',
};

export const ISSUE_SEVERITY_LABELS: Readonly<Record<SyncIssue['severity'], string>> = {
  WARNING: 'Advertencia',
  ERROR: 'Error',
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  auctionAt: 'Remate',
  guaranteePaymentAt: 'Pago de garantía',
  guaranteeReturnAt: 'Devolución de garantía',
  balancePaymentAt: 'Pago del saldo',
  title: 'Nombre',
  address: 'Dirección',
  commune: 'Comuna',
  region: 'Región',
  court: 'Corte',
  tribunal: 'Tribunal',
  caseReference: 'Rol',
  guaranteeAmount: 'Monto de garantía',
  guaranteeWindowStart: 'Inicio horario de garantía',
  guaranteeWindowEnd: 'Fin horario de garantía',
};

const DATE_FIELDS = new Set([
  'auctionAt',
  'guaranteePaymentAt',
  'guaranteeReturnAt',
  'balancePaymentAt',
]);

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (DATE_FIELDS.has(field) && typeof value === 'string') return formatDateTime(value);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
}

// Líneas legibles que resumen un cambio de origen («Remate: lun 7 dic 10:30 → lun 14 dic 10:30»).
export function describeChange(change: SourceChange): string[] {
  const current = change.currentValues ?? {};
  if (change.changeType === 'NO_LONGER_ACCEPTED') {
    if (current['existsInSource'] === false) return ['La propiedad ya no existe en admin_new.'];
    const classification = current['classificationId'];
    return [
      typeof classification === 'number'
        ? `Clasificación actual en admin_new: ${classification}.`
        : 'La propiedad ya no tiene clasificación en admin_new.',
    ];
  }
  if (change.changeType === 'PROPERTY_ACCEPTED') {
    if (current['reaccepted'] === true) return ['Vuelve a estar aceptada.'];
    return change.errorMessage ? [change.errorMessage] : ['Se inició su workflow.'];
  }
  const previous = change.previousValues ?? {};
  return Object.keys(current)
    .filter((field) => field in FIELD_LABELS)
    .map(
      (field) =>
        `${FIELD_LABELS[field]}: ${formatValue(field, previous[field])} → ${formatValue(field, current[field])}`,
    );
}

// Solo el aviso de propiedad no aceptada se revisa a mano; las fechas las procesa la reprogramación.
export const isReviewable = (change: SourceChange): boolean =>
  change.changeType === 'NO_LONGER_ACCEPTED' && change.status === 'PENDING';
