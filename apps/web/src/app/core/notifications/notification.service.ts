import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
import type { UserNotification } from './notification.model';

const FALLBACK_POLL_MILLISECONDS = 60_000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly notificationList = signal<readonly UserNotification[]>([]);
  private readonly count = signal(0);
  private readonly incomingNotification = signal<UserNotification | null>(null);
  private highestSeenId: number | null = null;
  private eventSource: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private workflowEventSource: EventSource | null = null;
  private workflowPollTimer: ReturnType<typeof setInterval> | null = null;
  private activeWorkflowId: number | null = null;
  private readonly workflowChanges = new Subject<number>();

  readonly notifications = this.notificationList.asReadonly();
  readonly latestIncoming = this.incomingNotification.asReadonly();
  readonly unreadCount = this.count.asReadonly();
  readonly hasUnread = computed(() => this.count() > 0);
  readonly workflowChanged = this.workflowChanges.asObservable();

  watchWorkflow(workflowId: number): void {
    if (this.activeWorkflowId === workflowId) return;
    this.stopWatchingWorkflow();
    this.activeWorkflowId = workflowId;
    this.workflowEventSource = new EventSource(
      `/api/notifications/stream?workflowId=${workflowId}`,
    );
    this.workflowEventSource.addEventListener('workflow', () =>
      this.workflowChanges.next(workflowId),
    );
    this.workflowPollTimer = setInterval(() => this.workflowChanges.next(workflowId), 30_000);
  }

  stopWatchingWorkflow(): void {
    this.workflowEventSource?.close();
    this.workflowEventSource = null;
    if (this.workflowPollTimer) clearInterval(this.workflowPollTimer);
    this.workflowPollTimer = null;
    this.activeWorkflowId = null;
  }

  async start(): Promise<void> {
    await this.refresh();
    if (typeof EventSource !== 'undefined' && !this.eventSource) {
      this.eventSource = new EventSource('/api/notifications/stream');
      this.eventSource.addEventListener('notifications', (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          unreadCount: number;
        };
        this.count.set(payload.unreadCount);
        void this.loadNotifications();
      });
    }
    this.pollTimer ??= setInterval(() => void this.refresh(), FALLBACK_POLL_MILLISECONDS);
  }

  refreshNotifications(): void {
    void this.refresh();
  }

  stop(): void {
    this.stopWatchingWorkflow();
    this.eventSource?.close();
    this.eventSource = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.notificationList.set([]);
    this.count.set(0);
    this.incomingNotification.set(null);
    this.highestSeenId = null;
  }

  async refresh(): Promise<void> {
    await Promise.all([this.loadNotifications(), this.loadCount()]);
  }

  async markRead(notificationId: number): Promise<void> {
    await firstValueFrom(this.http.post(`/api/notifications/${notificationId}/read`, null));
    await this.refresh();
  }

  async markAllRead(): Promise<void> {
    await firstValueFrom(this.http.post('/api/notifications/read-all', null));
    await this.refresh();
  }

  private async loadNotifications(): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<{ notifications: UserNotification[] }>('/api/notifications', {
        params: { limit: 30 },
      }),
    );
    const highestId = Math.max(0, ...response.notifications.map((notification) => notification.id));
    const previousHighestId = this.highestSeenId;
    if (previousHighestId !== null && highestId > previousHighestId) {
      const newestUnread = response.notifications.find(
        (notification) => notification.id > previousHighestId && notification.readAt === null,
      );
      if (newestUnread) this.incomingNotification.set(newestUnread);
    }
    this.highestSeenId = Math.max(this.highestSeenId ?? 0, highestId);
    this.notificationList.set(response.notifications);
  }

  private async loadCount(): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<{ unreadCount: number }>('/api/notifications/unread-count'),
    );
    this.count.set(response.unreadCount);
  }
}
