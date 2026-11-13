import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';
import { formatDateTime } from '../../core/time/santiago-time';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import {
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
  type PropertyRow,
  type WorkflowSummary,
} from '../../core/workflow/workflow.model';

// Tablero inicial: remates con workflow y, para ADMIN, propiedades que aún no lo tienen.
@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
})
export class HomePage implements OnInit {
  private readonly api = inject(WorkflowApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.currentUser;
  protected readonly isAdmin = this.auth.hasRole('ADMIN');
  protected readonly workflows = signal<readonly WorkflowSummary[]>([]);
  protected readonly properties = signal<readonly PropertyRow[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly startingPropertyId = signal<number | null>(null);

  protected readonly statusLabels = WORKFLOW_STATUS_LABELS;
  protected readonly statusTones = WORKFLOW_STATUS_TONES;
  protected readonly formatDateTime = formatDateTime;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const [workflowPage, properties] = await Promise.all([
        this.api.listWorkflows(),
        this.isAdmin ? this.api.listPropertiesWithoutWorkflow() : Promise.resolve([]),
      ]);
      this.workflows.set(workflowPage.workflows);
      this.properties.set(properties);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async startWorkflow(property: PropertyRow): Promise<void> {
    this.startingPropertyId.set(property.id);
    this.errorMessage.set(null);
    try {
      const workflow = await this.api.startWorkflow(property.id);
      await this.router.navigate(['/workflows', workflow.id]);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.startingPropertyId.set(null);
    }
  }
}
