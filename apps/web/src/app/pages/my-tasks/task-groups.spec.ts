import { formatRelativeDue, santiagoLocalToIso } from '../../core/time/santiago-time';
import { dueGroupOf, groupByDue } from './task-groups';

// Jueves 12 nov 2026, 22:30 en Santiago (UTC-3) = 13 nov 01:30 UTC.
const NOW = new Date('2026-11-13T01:30:00.000Z');

describe('grupos de Mis tareas', () => {
  it('clasifica por día calendario de Santiago, no por día UTC', () => {
    // 23:30 del mismo jueves en Santiago, aunque en UTC ya es viernes.
    expect(dueGroupOf('2026-11-13T02:30:00.000Z', NOW)).toBe('TODAY');
    // 00:30 del viernes en Santiago.
    expect(dueGroupOf('2026-11-13T03:30:00.000Z', NOW)).toBe('THIS_WEEK');
  });

  it('separa vencidas, esta semana, posteriores y sin vencimiento', () => {
    expect(dueGroupOf('2026-11-13T01:00:00.000Z', NOW)).toBe('OVERDUE');
    expect(dueGroupOf('2026-11-18T12:00:00.000Z', NOW)).toBe('THIS_WEEK');
    expect(dueGroupOf('2026-11-19T12:00:00.000Z', NOW)).toBe('LATER');
    expect(dueGroupOf(null, NOW)).toBe('NO_DUE');
  });

  it('cada tarea queda en un solo grupo', () => {
    const tasks = [
      { id: 1, dueAt: '2026-11-13T01:00:00.000Z' },
      { id: 2, dueAt: null },
      { id: 3, dueAt: '2026-11-13T02:30:00.000Z' },
    ];

    const groups = groupByDue(tasks, NOW);

    expect(
      [...groups.values()]
        .flat()
        .map((task) => task.id)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(groups.get('OVERDUE')?.map((task) => task.id)).toEqual([1]);
  });
});

describe('fechas en Santiago', () => {
  it('describe el vencimiento relativo en español', () => {
    expect(formatRelativeDue('2026-11-13T01:00:00.000Z', NOW)).toBe('Venció hace 30 min');
    expect(formatRelativeDue('2026-11-13T02:30:00.000Z', NOW)).toBe('Vence hoy a las 23:30');
    expect(formatRelativeDue(null, NOW)).toBe('Sin vencimiento');
  });

  it('convierte la hora local escrita por el usuario con el desfase vigente', () => {
    expect(santiagoLocalToIso('2026-12-07T10:00')).toBe('2026-12-07T10:00:00-03:00');
    expect(santiagoLocalToIso('2026-06-15T10:00')).toBe('2026-06-15T10:00:00-04:00');
  });
});
