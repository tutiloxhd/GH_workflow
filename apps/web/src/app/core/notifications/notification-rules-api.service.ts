import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { NotificationRule, NotificationRuleSet } from './notification-rules.model';

@Injectable({ providedIn: 'root' })
export class NotificationRulesApiService {
  private readonly http = inject(HttpClient);
  async list(): Promise<readonly NotificationRuleSet[]> {
    return (
      await firstValueFrom(
        this.http.get<{ ruleSets: NotificationRuleSet[] }>('/api/notification-rules'),
      )
    ).ruleSets;
  }
  async publish(
    ruleSetId: number,
    rules: readonly NotificationRule[],
  ): Promise<NotificationRuleSet> {
    return (
      await firstValueFrom(
        this.http.put<{ ruleSet: NotificationRuleSet }>(`/api/notification-rules/${ruleSetId}`, {
          rules,
        }),
      )
    ).ruleSet;
  }
}
