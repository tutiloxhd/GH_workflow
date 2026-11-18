import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { UserNotification } from './notification.model';

const FALLBACK_POLL_MILLISECONDS = 60_000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly notificationList = signal<readonly UserNotification[]>([]);
  private readonly count = signal(0);
  private eventSource: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly notifications = this.notificationList.asReadonly();
  readonly unreadCount = this.count.asReadonly();
  readonly hasUnread = computed(() => this.count() > 0);

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

  stop(): void {
    this.eventSource?.close();
    this.eventSource = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.notificationList.set([]);
    this.count.set(0);
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
    this.notificationList.set(response.notifications);
  }

  private async loadCount(): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<{ unreadCount: number }>('/api/notifications/unread-count'),
    );
    this.count.set(response.unreadCount);
  }
}
