import { describe, expect, it } from 'vitest';
import {
  findDefinitionIssues,
  findPublicationIssues,
  type TaskDefinitionInput,
} from './template-definition.js';

const task = (code: string, dependsOn: string[] = [], requiresEvidence = false) =>
  ({
    code,
    name: code,
    description: null,
    responsibleRole: 'ADMIN',
    requiresEvidence,
    dueReference: 'TASK_ACTIVATED_AT',
    dueOffsetDays: 3,
    dueOffsetMinutes: 0,
    dependsOn,
  }) satisfies TaskDefinitionInput;

describe('validación de la definición de una plantilla', () => {
  it('acepta dependencias simples, múltiples y paralelas', () => {
    expect(
      findPublicationIssues([task('A'), task('B', ['A']), task('C', ['A']), task('D', ['B', 'C'])]),
    ).toEqual([]);
  });

  it('rechaza códigos repetidos, dependencias desconocidas y a sí misma', () => {
    expect(
      findDefinitionIssues([task('A'), task('A'), task('B', ['Z']), task('C', ['C'])]),
    ).toEqual([
      { kind: 'DUPLICATE_CODE', taskCode: 'A' },
      { kind: 'UNKNOWN_DEPENDENCY', taskCode: 'B', dependsOn: 'Z' },
      { kind: 'SELF_DEPENDENCY', taskCode: 'C' },
    ]);
  });

  it('detecta ciclos de dependencias', () => {
    expect(findDefinitionIssues([task('A', ['C']), task('B', ['A']), task('C', ['B'])])).toEqual([
      { kind: 'DEPENDENCY_CYCLE', taskCodes: ['A', 'C', 'B', 'A'] },
    ]);
  });

  it('solo permite exigir evidencia en tareas que tienen formulario', () => {
    expect(findDefinitionIssues([task('COLLECT_VALE_VISTA', [], true)])).toEqual([]);
    expect(findDefinitionIssues([task('NUEVA_TAREA', [], true)])).toEqual([
      { kind: 'EVIDENCE_FORM_MISSING', taskCode: 'NUEVA_TAREA' },
    ]);
  });

  it('un borrador puede estar vacío, pero no se publica sin tareas', () => {
    expect(findDefinitionIssues([])).toEqual([]);
    expect(findPublicationIssues([])).toEqual([{ kind: 'NO_TASKS' }]);
  });
});
