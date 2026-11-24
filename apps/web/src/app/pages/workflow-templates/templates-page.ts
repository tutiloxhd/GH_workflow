import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { formatDateTime } from '../../core/time/santiago-time';
import {
  TEMPLATE_STATUS_LABELS,
  TEMPLATE_STATUS_TONES,
  type TemplateDetail,
  type TemplateSummary,
} from '../../core/workflow-templates/workflow-template.model';
import { WorkflowTemplatesApiService } from '../../core/workflow-templates/workflow-templates-api.service';
import { CreateFlowDialog } from './create-flow-dialog';

interface FlowGroup {
  readonly code: string;
  readonly name: string;
  readonly versions: readonly TemplateSummary[];
  readonly hasDraft: boolean;
  readonly latestId: number;
}

type PendingAction = { readonly kind: 'archive' | 'delete'; readonly templateId: number };

// Lista de flujos (plantillas) con sus versiones: borrador → publicada (activa) → archivada.
@Component({
  selector: 'app-templates-page',
  imports: [RouterLink, CreateFlowDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './templates-page.html',
  styleUrl: './templates-page.css',
})
export class TemplatesPage implements OnInit {
  private readonly api = inject(WorkflowTemplatesApiService);
  private readonly router = inject(Router);

  protected readonly templates = signal<readonly TemplateSummary[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isBusy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly isCreating = signal(false);
  protected readonly pendingAction = signal<PendingAction | null>(null);

  protected readonly statusLabels = TEMPLATE_STATUS_LABELS;
  protected readonly statusTones = TEMPLATE_STATUS_TONES;
  protected readonly formatDateTime = formatDateTime;

  // Agrupa las versiones por código; la API ya las entrega por versión descendente.
  protected readonly flows = computed<readonly FlowGroup[]>(() => {
    const groups = new Map<string, TemplateSummary[]>();
    for (const template of this.templates()) {
      groups.set(template.code, [...(groups.get(template.code) ?? []), template]);
    }
    return [...groups.entries()].map(([code, versions]) => ({
      code,
      name: versions[0]?.name ?? code,
      versions,
      hasDraft: versions.some((version) => version.status === 'DRAFT'),
      latestId: versions[0]?.id ?? 0,
    }));
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.isLoading.set(true);
    try {
      this.templates.set(await this.api.list());
      this.errorMessage.set(null);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected isPending(kind: PendingAction['kind'], templateId: number): boolean {
    const pending = this.pendingAction();
    return pending?.kind === kind && pending.templateId === templateId;
  }

  private async run(action: () => Promise<unknown>, successNotice: string): Promise<void> {
    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.notice.set(null);
    try {
      await action();
      this.notice.set(successNotice);
      await this.load();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isBusy.set(false);
      this.pendingAction.set(null);
    }
  }

  // La nueva versión copia la más reciente del flujo y se abre en el editor.
  protected async createVersion(flow: FlowGroup): Promise<void> {
    this.isBusy.set(true);
    this.errorMessage.set(null);
    try {
      const draft = await this.api.createVersion(flow.latestId);
      await this.router.navigate(['/flujos', draft.id]);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async onFlowCreated(draft: TemplateDetail): Promise<void> {
    await this.router.navigate(['/flujos', draft.id]);
  }

  protected archive(template: TemplateSummary): void {
    void this.run(
      () => this.api.archive(template.id),
      `${template.name} v${template.version} quedó archivada.`,
    );
  }

  protected deleteDraft(template: TemplateSummary): void {
    void this.run(
      () => this.api.deleteDraft(template.id),
      `Se eliminó el borrador v${template.version} de ${template.name}.`,
    );
  }
}
