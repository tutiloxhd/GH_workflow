import { calendarDaysBetween } from '../../core/time/santiago-time';

// Grupos de «Mis tareas», como en la maqueta. Cada tarea cae en un solo grupo.
export type DueGroup = 'OVERDUE' | 'TODAY' | 'THIS_WEEK' | 'LATER' | 'NO_DUE';

export const DUE_GROUP_ORDER: readonly DueGroup[] = [
  'OVERDUE',
  'TODAY',
  'THIS_WEEK',
  'LATER',
  'NO_DUE',
];

export const DUE_GROUP_LABELS: Readonly<Record<DueGroup, string>> = {
  OVERDUE: 'Vencidas',
  TODAY: 'Vencen hoy',
  THIS_WEEK: 'Esta semana',
  LATER: 'Posteriores',
  NO_DUE: 'Sin vencimiento',
};

// «Esta semana» = los próximos 7 días calendario en Santiago, sin contar hoy.
const DAYS_IN_WEEK = 7;

export function dueGroupOf(dueAt: string | null, now: Date): DueGroup {
  if (!dueAt) return 'NO_DUE';
  const due = new Date(dueAt);
  if (due.getTime() < now.getTime()) return 'OVERDUE';
  const days = calendarDaysBetween(now, due);
  if (days === 0) return 'TODAY';
  if (days < DAYS_IN_WEEK) return 'THIS_WEEK';
  return 'LATER';
}

export function groupByDue<Task extends { readonly dueAt: string | null }>(
  tasks: readonly Task[],
  now: Date,
): ReadonlyMap<DueGroup, readonly Task[]> {
  return new Map(
    DUE_GROUP_ORDER.map((group) => [
      group,
      tasks.filter((task) => dueGroupOf(task.dueAt, now) === group),
    ]),
  );
}
