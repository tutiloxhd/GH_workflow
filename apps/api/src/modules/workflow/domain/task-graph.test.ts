import { describe, expect, it } from 'vitest';
import type { TaskStatus } from './statuses.js';
import { areAllTasksCompleted, findTasksReadyToActivate } from './task-graph.js';

const task = (definitionId: number, status: TaskStatus) => ({
  id: definitionId,
  definitionId,
  status,
});

describe('findTasksReadyToActivate', () => {
  // 1 → (2, 3); 4 depende de 2 y 3.
  const requirements = new Map([
    [2, [1]],
    [3, [1]],
    [4, [2, 3]],
  ]);

  it('activa en paralelo todas las tareas cuyo único requisito se completó', () => {
    const ready = findTasksReadyToActivate(
      [task(1, 'COMPLETED'), task(2, 'BLOCKED'), task(3, 'BLOCKED'), task(4, 'BLOCKED')],
      requirements,
    );

    expect(ready.map((candidate) => candidate.definitionId)).toEqual([2, 3]);
  });

  it('una tarea con varios requisitos espera a que se completen todos', () => {
    const tasks = [
      task(1, 'COMPLETED'),
      task(2, 'COMPLETED'),
      task(3, 'IN_PROGRESS'),
      task(4, 'BLOCKED'),
    ];

    expect(findTasksReadyToActivate(tasks, requirements)).toEqual([]);
  });

  it('no reactiva tareas que ya no están bloqueadas y activa las que no tienen requisitos', () => {
    expect(
      findTasksReadyToActivate([task(1, 'BLOCKED'), task(2, 'READY')], requirements).map(
        (candidate) => candidate.definitionId,
      ),
    ).toEqual([1]);
  });
});

describe('areAllTasksCompleted', () => {
  it('exige que todas las tareas estén completadas', () => {
    expect(areAllTasksCompleted([task(1, 'COMPLETED'), task(2, 'COMPLETED')])).toBe(true);
    expect(areAllTasksCompleted([task(1, 'COMPLETED'), task(2, 'SUSPENDED')])).toBe(false);
    expect(areAllTasksCompleted([])).toBe(false);
  });
});
