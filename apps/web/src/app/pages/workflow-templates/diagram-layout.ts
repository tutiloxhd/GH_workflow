import type { DiagramPoint } from './flow-diagram';

export const COLUMN_WIDTH = 280;
export const ROW_HEIGHT = 130;

interface LayoutTask {
  readonly code: string;
  readonly dependsOn: readonly string[];
  readonly position: DiagramPoint | null;
}

// Ubicación automática por niveles: cada tarea va una columna a la derecha de la más lejana de
// sus requisitos y, dentro de la columna, en el orden de la lista. Las tareas que ya tienen
// posición la conservan. Un ciclo (que la API rechaza) no rompe el cálculo.
export function layoutPositions(tasks: readonly LayoutTask[]): DiagramPoint[] {
  const indexByCode = new Map(tasks.map((task, index) => [task.code, index]));
  const levels = new Map<number, number>();

  const levelOf = (index: number, visiting: Set<number>): number => {
    const known = levels.get(index);
    if (known !== undefined) return known;
    if (visiting.has(index)) return 0;
    visiting.add(index);
    const requirements = (tasks[index]?.dependsOn ?? [])
      .map((code) => indexByCode.get(code))
      .filter((requirement): requirement is number => requirement !== undefined);
    const level =
      requirements.length === 0
        ? 0
        : Math.max(...requirements.map((requirement) => levelOf(requirement, visiting))) + 1;
    visiting.delete(index);
    levels.set(index, level);
    return level;
  };

  const rowsUsed = new Map<number, number>();
  return tasks.map((task, index) => {
    if (task.position) return task.position;
    const level = levelOf(index, new Set());
    const row = rowsUsed.get(level) ?? 0;
    rowsUsed.set(level, row + 1);
    return { x: level * COLUMN_WIDTH, y: row * ROW_HEIGHT };
  });
}

// ¿`fromCode` ya depende (directa o indirectamente) de `toCode`? Si es así, hacer que `toCode`
// dependa de `fromCode` cerraría un ciclo.
export function wouldCreateCycle(
  tasks: readonly LayoutTask[],
  fromCode: string,
  toCode: string,
): boolean {
  const requirementsOf = new Map(tasks.map((task) => [task.code, task.dependsOn]));
  const pending = [fromCode];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const code = pending.pop();
    if (code === undefined || seen.has(code)) continue;
    if (code === toCode) return true;
    seen.add(code);
    pending.push(...(requirementsOf.get(code) ?? []));
  }
  return false;
}
