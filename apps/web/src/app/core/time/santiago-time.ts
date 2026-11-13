// Fechas de negocio en la zona de America/Santiago, sin dependencias. La API guarda UTC;
// aquí se convierte solo para mostrar o para leer lo que el usuario escribe.
export const BUSINESS_TIME_ZONE = 'America/Santiago';

const dateTimeFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  timeZoneName: 'longOffset',
});

export function formatDateTime(iso: string | null): string {
  return iso ? dateTimeFormatter.format(new Date(iso)) : 'Sin fecha';
}

// Día calendario en Santiago como AAAA-MM-DD.
export const santiagoDayKey = (instant: Date): string => dayKeyFormatter.format(instant);

const MILLISECONDS_PER_DAY = 86_400_000;

// Días calendario de diferencia en Santiago (negativo si `to` es anterior).
export function calendarDaysBetween(from: Date, to: Date): number {
  const fromDay = Date.parse(`${santiagoDayKey(from)}T00:00:00Z`);
  const toDay = Date.parse(`${santiagoDayKey(to)}T00:00:00Z`);
  return Math.round((toDay - fromDay) / MILLISECONDS_PER_DAY);
}

export function formatRelativeDue(iso: string | null, now: Date): string {
  if (!iso) return 'Sin vencimiento';
  const due = new Date(iso);
  const minutes = Math.round((due.getTime() - now.getTime()) / 60_000);
  if (minutes < 0) {
    const elapsed = -minutes;
    if (elapsed < 60) return `Venció hace ${elapsed} min`;
    if (elapsed < 24 * 60) return `Venció hace ${Math.round(elapsed / 60)} h`;
    return `Venció hace ${-calendarDaysBetween(now, due)} días`;
  }
  if (minutes < 60) return `Vence en ${minutes} min`;
  const days = calendarDaysBetween(now, due);
  if (days === 0) return `Vence hoy a las ${formatTime(due)}`;
  if (days === 1) return `Vence mañana a las ${formatTime(due)}`;
  return `Vence en ${days} días`;
}

const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const formatTime = (instant: Date): string => timeFormatter.format(instant);

// Desfase de Santiago («-03:00» o «-04:00») vigente en un instante.
function offsetAt(instant: Date): string {
  const zoneName = offsetFormatter
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;
  const offset = zoneName?.replace('GMT', '') ?? '';
  return offset === '' ? '+00:00' : offset;
}

// Convierte el valor de un <input type="datetime-local"> (hora de Santiago) en un instante ISO
// con su desfase explícito, que es lo que la API espera.
export function santiagoLocalToIso(localValue: string): string {
  const wallClock = `${localValue.length === 16 ? `${localValue}:00` : localValue}`;
  const firstGuess = new Date(`${wallClock}${offsetAt(new Date(`${wallClock}Z`))}`);
  return `${wallClock}${offsetAt(firstGuess)}`;
}
