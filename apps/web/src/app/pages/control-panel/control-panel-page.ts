import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import {
  NOTIFICATION_EVENT_DESCRIPTIONS,
  NOTIFICATION_EVENT_LABELS,
  type NotificationRule,
  type NotificationRuleSet,
} from '../../core/notifications/notification-rules.model';
import { NotificationRulesApiService } from '../../core/notifications/notification-rules-api.service';
import { formatDateTime } from '../../core/time/santiago-time';

@Component({
  selector: 'app-control-panel-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './control-panel-page.html',
  styleUrl: './control-panel-page.css',
})
export class ControlPanelPage {
  private readonly api = inject(NotificationRulesApiService);
  protected readonly ruleSets = signal<readonly NotificationRuleSet[]>([]);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly draftRules = signal<readonly NotificationRule[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly labels = NOTIFICATION_EVENT_LABELS;
  protected readonly descriptions = NOTIFICATION_EVENT_DESCRIPTIONS;
  protected readonly formatDateTime = formatDateTime;
  protected readonly selectedRuleSet = computed(() =>
    this.ruleSets().find((ruleSet) => ruleSet.id === this.selectedId()),
  );

  constructor() {
    void this.load();
  }
  protected async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const ruleSets = await this.api.list();
      this.ruleSets.set(ruleSets);
      if (ruleSets[0]) this.selectRuleSet(ruleSets[0].id);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }
  protected selectRuleSet(ruleSetId: number): void {
    const ruleSet = this.ruleSets().find((candidate) => candidate.id === ruleSetId);
    if (!ruleSet) return;
    this.selectedId.set(ruleSet.id);
    this.draftRules.set(ruleSet.rules.map((rule) => ({ ...rule })));
    this.successMessage.set(null);
  }
  protected setEnabled(eventType: NotificationRule['eventType'], isEnabled: boolean): void {
    this.updateRule(eventType, (rule) => ({ ...rule, isEnabled }));
  }
  protected setOffsetHours(eventType: NotificationRule['eventType'], rawValue: string): void {
    const hours = Math.max(0, Math.min(8760, Number(rawValue) || 0));
    this.updateRule(eventType, (rule) => ({ ...rule, offsetMinutes: Math.round(hours * 60) }));
  }
  protected usesOffset(rule: NotificationRule): boolean {
    return rule.eventType === 'TASK_REMINDER' || rule.eventType === 'TASK_ESCALATION';
  }
  protected async save(): Promise<void> {
    const current = this.selectedRuleSet();
    if (!current) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      const published = await this.api.publish(current.id, this.draftRules());
      this.ruleSets.update((sets) =>
        sets.map((set) =>
          set.workflowTemplate.id === published.workflowTemplate.id ? published : set,
        ),
      );
      this.selectRuleSet(published.id);
      this.successMessage.set(`Cambios publicados como versión ${published.version}.`);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
  private updateRule(
    eventType: NotificationRule['eventType'],
    update: (rule: NotificationRule) => NotificationRule,
  ): void {
    this.draftRules.update((rules) =>
      rules.map((rule) => (rule.eventType === eventType ? update(rule) : rule)),
    );
    this.successMessage.set(null);
  }
}
