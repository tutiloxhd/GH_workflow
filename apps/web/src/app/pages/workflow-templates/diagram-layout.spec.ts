import { COLUMN_WIDTH, layoutPositions, ROW_HEIGHT, wouldCreateCycle } from './diagram-layout';

const step = (
  code: string,
  dependsOn: string[] = [],
  position: { x: number; y: number } | null = null,
) => ({ code, dependsOn, position });

describe('layoutPositions', () => {
  it('ubica cada tarea una columna después de su requisito más lejano', () => {
    const positions = layoutPositions([
      step('A'),
      step('B', ['A']),
      step('C', ['A']),
      step('D', ['B', 'C']),
      step('E', [], { x: 900, y: 40 }),
    ]);
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: COLUMN_WIDTH, y: 0 },
      { x: COLUMN_WIDTH, y: ROW_HEIGHT },
      { x: 2 * COLUMN_WIDTH, y: 0 },
      { x: 900, y: 40 },
    ]);
  });

  it('no se cuelga con un ciclo', () => {
    expect(layoutPositions([step('A', ['B']), step('B', ['A'])])).toHaveLength(2);
  });
});

describe('wouldCreateCycle', () => {
  it('detecta un ciclo directo o indirecto', () => {
    const tasks = [step('A'), step('B', ['A']), step('C', ['B'])];
    expect(wouldCreateCycle(tasks, 'C', 'A')).toBe(true);
    expect(wouldCreateCycle(tasks, 'A', 'C')).toBe(false);
  });
});
