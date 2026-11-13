import type { TaskStatus } from './statuses.js';

export interface TaskNode {
  readonly id: number;
  readonly definitionId: number;
  readonly status: TaskStatus;
}

// Tareas bloqueadas cuyas dependencias están todas completadas. Varias pueden activarse a la vez:
// así se expresa el paralelismo, sin un número de paso lineal.
export function findTasksReadyToActivate<Task extends TaskNode>(
  tasks: readonly Task[],
  requirementsByDefinition: ReadonlyMap<number, readonly number[]>,
): Task[] {
  const completedDefinitions = new Set(
    tasks.filter((task) => task.status === 'COMPLETED').map((task) => task.definitionId),
  );
  return tasks.filter(
    (task) =>
      task.status === 'BLOCKED' &&
      (requirementsByDefinition.get(task.definitionId) ?? []).every((requirement) =>
        completedDefinitions.has(requirement),
      ),
  );
}

// El workflow termina cuando todas sus tareas están completadas.
export const areAllTasksCompleted = (tasks: readonly TaskNode[]): boolean =>
  tasks.length > 0 && tasks.every((task) => task.status === 'COMPLETED');
