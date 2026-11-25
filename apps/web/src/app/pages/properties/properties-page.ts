import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { formatDateTime } from '../../core/time/santiago-time';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import type { PropertyRow } from '../../core/workflow/workflow.model';
import { ListPagination } from '../../shared/pagination/list-pagination';

@Component({
  selector: 'app-properties-page',
  imports: [ListPagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './properties-page.html',
  styleUrl: './properties-page.css',
})
export class PropertiesPage implements OnInit {
  private readonly api = inject(WorkflowApiService);
  private readonly router = inject(Router);
  protected readonly properties = signal<readonly PropertyRow[]>([]);
  protected readonly total = signal(0);
  protected readonly pageSize = signal(10);
  protected readonly offset = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly startingPropertyId = signal<number | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly formatDateTime = formatDateTime;

  ngOnInit(): void { void this.load(); }

  protected async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const page = await this.api.listPropertiesWithoutWorkflow(this.pageSize(), this.offset());
      this.properties.set(page.properties);
      this.total.set(page.total);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected setPageSize(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.offset.set(0);
    void this.load();
  }

  protected setOffset(offset: number): void {
    this.offset.set(offset);
    void this.load();
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
