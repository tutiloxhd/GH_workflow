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
import { DUE_REFERENCE_LABELS, type DueReference } from '../../core/workflow/workflow.model';
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
}

const DEFAULT_DUE_OFFSET_DAYS = 3;

// Editor de una versión de flujo. Solo los borradores se editan; las publicadas se muestran
// en modo lectura y se cambian creando una nueva versión.
@Component({
  selector: 'app-template-editor-page',
  imports: [FormsModule, RouterLink],
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
  private nextKey = 1;

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly dueReferenceLabels = DUE_REFERENCE_LABELS;
  protected readonly statusLabels = TEMPLATE_STATUS_LABELS;
  protected readonly statusTones = TEMPLATE_STATUS_TONES;
  protected readonly formatDateTime = formatDateTime;
  protected readonly describeIssue = describeTemplateIssue;

  protected readonly isEditable = computed(() => this.template()?.status === 'DRAFT');

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
    this.tasks.set(
      template.tasks.map((task) => ({
        ...task,
        key: this.nextKey++,
        description: task.description ?? '',
        dependsOn: [...task.dependsOn],
      })),
    );
    this.isDirty.set(false);
  }

  // Cada cambio crea una lista nueva para que OnPush vuelva a dibujar lo derivado.
  protected touch(): void {
    this.tasks.update((tasks) => [...tasks]);
    this.isDirty.set(true);
    this.issues.set([]);
  }

  protected hasEvidenceForm(code: string): boolean {
    return this.catalog()?.evidenceFormTaskCodes.includes(code) ?? false;
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
    if (!this.hasEvidenceForm(code)) task.requiresEvidence = false;
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
    this.tasks.update((tasks) => [
      ...tasks,
      {
        key: this.nextKey++,
        code: '',
        name: '',
        description: '',
        responsibleRole: 'ADMIN',
        requiresEvidence: false,
        dueReference: 'TASK_ACTIVATED_AT',
        dueOffsetDays: DEFAULT_DUE_OFFSET_DAYS,
        dueOffsetMinutes: 0,
        dependsOn: last?.code ? [last.code] : [],
      },
    ]);
    this.isDirty.set(true);
  }

  protected removeTask(task: EditableTask): void {
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
