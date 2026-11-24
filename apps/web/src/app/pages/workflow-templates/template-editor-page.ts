import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  numberAttribute,
  signal,
  type OnInit,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { problemMessage, toApiProblem, type ApiProblem } from '../../core/api/api-problem';
import { formatDateTime } from '../../core/time/santiago-time';
import { ROLE_LABELS, type RoleCode } from '../../core/users/user.model';
import {
  describeTemplateIssue,
  TEMPLATE_STATUS_LABELS,
  TEMPLATE_STATUS_TONES,
  type TemplateCatalog,
  type TemplateDetail,
  type TemplateIssue,
  type TemplateTask,
} from '../../core/workflow-templates/workflow-template.model';
import { WorkflowTemplatesApiService } from '../../core/workflow-templates/workflow-templates-api.service';
import {
  dayUnit,
  describeDeadline,
  type DeadlineDayKind,
  type DeadlineRule,
} from '../../core/workflow/deadline-rule';
import type { DueReference, EvidenceForm } from '../../core/workflow/workflow.model';
import { DeadlineRuleEditor } from '../../shared/deadline/deadline-rule-editor';
import { COLUMN_WIDTH, layoutPositions, wouldCreateCycle } from './diagram-layout';
import { EvidenceFormBuilder } from './evidence-form-builder';
import { FlowDiagram, type DiagramLink, type DiagramNode, type DiagramPoint } from './flow-diagram';
import { toCode } from './template-code';

// Copia editable de una tarea; `key` identifica la fila aunque cambie su código.
interface EditableTask {
  key: number;
  code: string;
  name: string;
  description: string;
  responsibleRole: RoleCode;
  requiresEvidence: boolean;
  dueReference: DueReference;
  dueOffsetDays: number;
  dueOffsetMinutes: number;
  dependsOn: string[];
  position: DiagramPoint;
  evidenceForm: EvidenceForm | null;
}

type ViewMode = 'diagram' | 'list';
const VIEW_MODE_STORAGE_KEY = 'template-editor.view-mode';
// En pantallas angostas el diagrama es incómodo: la lista es la vista inicial.
const NARROW_SCREEN_QUERY = '(max-width: 760px)';

function initialViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === 'diagram' || stored === 'list') return stored;
  } catch {
    // Sin almacenamiento disponible se usa la vista por omisión.
  }
  return typeof matchMedia === 'function' && matchMedia(NARROW_SCREEN_QUERY).matches
    ? 'list'
    : 'diagram';
}

const DEFAULT_DUE_OFFSET_DAYS = 3;

// «3 d hábiles antes de la fecha del remate»: el plazo compacto de la caja del diagrama.
function shortDeadline(rule: DeadlineRule, dayKind: DeadlineDayKind): string {
  const sentence = describeDeadline(rule, dayKind).replace(/^Vence /, '');
  const days = Math.abs(rule.dueOffsetDays);
  return days === 0 ? sentence : sentence.replace(dayUnit(days, dayKind), 'd');
}

// Editor de una versión de flujo. Solo los borradores se editan; las publicadas se muestran
// en modo lectura y se cambian creando una nueva versión.
@Component({
  selector: 'app-template-editor-page',
  imports: [
    FormsModule,
    RouterLink,
    NgTemplateOutlet,
    DeadlineRuleEditor,
    EvidenceFormBuilder,
    FlowDiagram,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './template-editor-page.html',
  styleUrl: './template-editor-page.css',
})
export class TemplateEditorPage implements OnInit {
  private readonly api = inject(WorkflowTemplatesApiService);
  private readonly router = inject(Router);

  // Parámetro de ruta (withComponentInputBinding).
  readonly templateId = input.required({ transform: numberAttribute });

  protected readonly template = signal<TemplateDetail | null>(null);
  protected readonly catalog = signal<TemplateCatalog | null>(null);
  protected readonly tasks = signal<EditableTask[]>([]);
  protected name = '';
  protected readonly isDirty = signal(false);
  protected readonly isBusy = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly issues = signal<readonly TemplateIssue[]>([]);
  protected readonly notice = signal<string | null>(null);
  protected readonly confirming = signal<'publish' | 'delete' | null>(null);
  protected readonly viewMode = signal<ViewMode>(initialViewMode());
  protected readonly selectedKey = signal<number | null>(null);
  private nextKey = 1;

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly statusLabels = TEMPLATE_STATUS_LABELS;
  protected readonly statusTones = TEMPLATE_STATUS_TONES;
  protected readonly formatDateTime = formatDateTime;
  protected readonly describeIssue = describeTemplateIssue;

  protected readonly isEditable = computed(() => this.template()?.status === 'DRAFT');

  protected readonly selectedIndex = computed(() =>
    this.tasks().findIndex((task) => task.key === this.selectedKey()),
  );
  protected readonly selectedTask = computed(() => this.tasks()[this.selectedIndex()] ?? null);

  protected readonly diagramNodes = computed<DiagramNode[]>(() => {
    const tasks = this.tasks();
    const keyByCode = new Map(tasks.map((task) => [task.code, task.key]));
    const dayKind = this.template()?.deadlineDayKind ?? 'BUSINESS';
    return tasks.map((task) => ({
      key: task.key,
      code: task.code,
      title: task.name || task.code || 'Tarea sin nombre',
      subtitle: `${this.roleLabels[task.responsibleRole]} · ${shortDeadline(task, dayKind)}`,
      badges: [
        ...(task.dependsOn.length === 0 ? ['Inicial'] : []),
        ...(task.requiresEvidence ? ['Evidencia'] : []),
      ],
      position: task.position,
      dependsOnKeys: task.dependsOn
        .map((code) => keyByCode.get(code))
        .filter((key): key is number => key !== undefined),
    }));
  });

  // Revisión local mínima; la API valida todo (incluidos los ciclos) al guardar.
  protected readonly localProblems = computed(() => {
    const problems: string[] = [];
    const codes = this.tasks().map((task) => task.code);
    if (codes.some((code) => code === '')) problems.push('Hay tareas sin código.');
    if (this.tasks().some((task) => task.name.trim() === '')) {
      problems.push('Hay tareas sin nombre.');
    }
    const repeated = [...new Set(codes.filter((code, index) => codes.indexOf(code) !== index))];
    for (const code of repeated) if (code) problems.push(`El código ${code} está repetido.`);
    return problems;
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [template, catalog] = await Promise.all([
        this.api.get(this.templateId()),
        this.api.catalog(),
      ]);
      this.catalog.set(catalog);
      this.applyTemplate(template);
    } catch (error) {
      this.loadError.set(problemMessage(toApiProblem(error)));
    }
  }

  private applyTemplate(template: TemplateDetail): void {
    this.template.set(template);
    this.name = template.name;
    const positions = layoutPositions(template.tasks);
    this.tasks.set(
      template.tasks.map((task, index) => ({
        ...task,
        key: this.nextKey++,
        description: task.description ?? '',
        dependsOn: [...task.dependsOn],
        position: positions[index] ?? { x: 0, y: 0 },
      })),
    );
    this.selectedKey.set(null);
    this.isDirty.set(false);
  }

  protected setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // La preferencia es solo una comodidad.
    }
  }

  protected moveNode(key: number, position: DiagramPoint): void {
    const task = this.tasks().find((candidate) => candidate.key === key);
    if (!task || !this.isEditable()) return;
    task.position = { x: Math.round(position.x), y: Math.round(position.y) };
    this.touch();
  }

  // Une dos tareas: `to` se activa cuando se complete `from`.
  protected linkTasks(fromKey: number, toKey: number): void {
    const tasks = this.tasks();
    const from = tasks.find((task) => task.key === fromKey);
    const to = tasks.find((task) => task.key === toKey);
    if (!from || !to || !this.isEditable()) return;
    this.notice.set(null);
    if (!from.code || !to.code) {
      this.errorMessage.set('Asigna un código a ambas tareas antes de unirlas.');
      return;
    }
    if (from.key === to.key || to.dependsOn.includes(from.code)) return;
    if (wouldCreateCycle(tasks, from.code, to.code)) {
      const fromName = from.name || from.code;
      const toName = to.name || to.code;
      this.errorMessage.set(
        `No se puede: «${fromName}» ya depende de «${toName}» y se formaría un ciclo.`,
      );
      return;
    }
    this.errorMessage.set(null);
    to.dependsOn = [...to.dependsOn, from.code];
    this.touch();
  }

  protected unlinkTasks(links: readonly DiagramLink[]): void {
    const codeByKey = new Map(this.tasks().map((task) => [task.key, task.code]));
    for (const link of links) {
      const task = this.tasks().find((candidate) => candidate.key === link.toKey);
      const requirement = codeByKey.get(link.fromKey);
      if (task && requirement) {
        task.dependsOn = task.dependsOn.filter((code) => code !== requirement);
      }
    }
    this.touch();
  }

  // Cada cambio crea una lista nueva para que OnPush vuelva a dibujar lo derivado.
  protected setDeadline(task: EditableTask, rule: DeadlineRule): void {
    task.dueReference = rule.dueReference;
    task.dueOffsetDays = rule.dueOffsetDays;
    task.dueOffsetMinutes = rule.dueOffsetMinutes;
    this.tasks.update((tasks) => [...tasks]);
    this.touch();
  }

  protected touch(): void {
    this.tasks.update((tasks) => [...tasks]);
    this.isDirty.set(true);
    this.issues.set([]);
  }

  // Crear el primer campo marca la tarea como «exige evidencia»; quitar todos lo desmarca.
  protected setEvidenceForm(task: EditableTask, form: EvidenceForm | null): void {
    if (!task.evidenceForm && form) task.requiresEvidence = true;
    if (!form) task.requiresEvidence = false;
    task.evidenceForm = form;
    this.touch();
  }

  protected isParticipantAssignment(code: string): boolean {
    return this.catalog()?.participantAssignmentTaskCode === code;
  }

  protected otherTasks(task: EditableTask): EditableTask[] {
    return this.tasks().filter((candidate) => candidate.key !== task.key && candidate.code);
  }

  protected dependencyNames(task: EditableTask): string {
    const byCode = new Map(this.tasks().map((candidate) => [candidate.code, candidate.name]));
    return task.dependsOn.map((code) => byCode.get(code) ?? code).join(', ');
  }

  // Al cambiar un código se actualizan las dependencias que lo nombraban.
  protected renameTask(task: EditableTask, rawCode: string): void {
    const previous = task.code;
    const code = toCode(rawCode);
    task.code = code;
    if (previous) {
      for (const other of this.tasks()) {
        other.dependsOn = other.dependsOn.map((requirement) =>
          requirement === previous ? code : requirement,
        );
      }
    }
    this.touch();
  }

  protected toggleDependency(task: EditableTask, code: string, isChecked: boolean): void {
    task.dependsOn = isChecked
      ? [...task.dependsOn, code]
      : task.dependsOn.filter((requirement) => requirement !== code);
    this.touch();
  }

  // La tarea nueva depende de la última, que es el caso más común en un flujo secuencial.
  protected addTask(): void {
    const last = this.tasks().at(-1);
    const key = this.nextKey++;
    this.tasks.update((tasks) => [
      ...tasks,
      {
        key,
        code: '',
        name: '',
        description: '',
        responsibleRole: 'ADMIN',
        requiresEvidence: false,
        dueReference: 'TASK_ACTIVATED_AT',
        dueOffsetDays: DEFAULT_DUE_OFFSET_DAYS,
        dueOffsetMinutes: 0,
        dependsOn: last?.code ? [last.code] : [],
        evidenceForm: null,
        // A la derecha de la última tarea, donde la flecha queda corta.
        position: last ? { x: last.position.x + COLUMN_WIDTH, y: last.position.y } : { x: 0, y: 0 },
      },
    ]);
    this.selectedKey.set(key);
    this.isDirty.set(true);
  }

  protected removeTask(task: EditableTask): void {
    if (this.selectedKey() === task.key) this.selectedKey.set(null);
    this.tasks.update((tasks) =>
      tasks
        .filter((candidate) => candidate.key !== task.key)
        .map((candidate) => ({
          ...candidate,
          dependsOn: candidate.dependsOn.filter((requirement) => requirement !== task.code),
        })),
    );
    this.isDirty.set(true);
  }

  protected moveTask(index: number, offset: -1 | 1): void {
    const target = index + offset;
    this.tasks.update((tasks) => {
      const moved = [...tasks];
      const [task] = moved.splice(index, 1);
      if (task) moved.splice(target, 0, task);
      return moved;
    });
    this.isDirty.set(true);
  }

  private toPayload(): TemplateTask[] {
    return this.tasks().map((task) => ({
      code: task.code,
      name: task.name.trim(),
      description: task.description.trim() || null,
      responsibleRole: task.responsibleRole,
      requiresEvidence: task.requiresEvidence,
      dueReference: task.dueReference,
      dueOffsetDays: Number(task.dueOffsetDays) || 0,
      dueOffsetMinutes: Number(task.dueOffsetMinutes) || 0,
      dependsOn: task.dependsOn,
      position: { x: Math.round(task.position.x), y: Math.round(task.position.y) },
      evidenceForm: task.evidenceForm,
    }));
  }

  private showProblem(problem: ApiProblem): void {
    this.errorMessage.set(problemMessage(problem));
    this.issues.set((problem.issues ?? []) as unknown as TemplateIssue[]);
  }

  private async persist(): Promise<TemplateDetail | null> {
    const template = this.template();
    if (!template) return null;
    if (this.localProblems().length > 0) {
      this.errorMessage.set('Corrige los problemas marcados antes de guardar.');
      return null;
    }
    const saved = await this.api.saveDraft(template.id, this.name.trim(), this.toPayload());
    this.applyTemplate(saved);
    return saved;
  }

  protected async save(): Promise<void> {
    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.notice.set(null);
    try {
      if (await this.persist()) this.notice.set('Borrador guardado.');
    } catch (error) {
      this.showProblem(toApiProblem(error));
    } finally {
      this.isBusy.set(false);
    }
  }

  // Publicar guarda primero los cambios pendientes del borrador.
  protected async publish(): Promise<void> {
    this.confirming.set(null);
    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.notice.set(null);
    try {
      const saved = this.isDirty() ? await this.persist() : this.template();
      if (!saved) return;
      this.applyTemplate(await this.api.publish(saved.id));
      this.notice.set('Versión publicada: los remates nuevos usarán este flujo.');
    } catch (error) {
      this.showProblem(toApiProblem(error));
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async deleteDraft(): Promise<void> {
    const template = this.template();
    if (!template) return;
    this.confirming.set(null);
    this.isBusy.set(true);
    try {
      await this.api.deleteDraft(template.id);
      await this.router.navigate(['/flujos']);
    } catch (error) {
      this.showProblem(toApiProblem(error));
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async createVersion(): Promise<void> {
    const template = this.template();
    if (!template) return;
    this.isBusy.set(true);
    this.errorMessage.set(null);
    try {
      const draft = await this.api.createVersion(template.id);
      await this.router.navigate(['/flujos', draft.id]);
      this.applyTemplate(draft);
      this.notice.set(`Borrador v${draft.version} creado a partir de v${template.version}.`);
    } catch (error) {
      this.showProblem(toApiProblem(error));
    } finally {
      this.isBusy.set(false);
    }
  }
}
