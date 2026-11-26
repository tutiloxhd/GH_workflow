import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';
import type { UserNotification } from './notification.model';

const notification = (id: number, readAt: string | null = null): UserNotification => ({
  id,
  trigger: 'TASK_ASSIGNED',
  title: `Tarea ${id}`,
  body: 'Tarea de prueba',
  workflowId: 12,
  taskId: id,
  readAt,
  createdAt: '2026-11-25T12:00:00.000Z',
});

describe('NotificationService floating arrivals', () => {
  it('ignores the initial list and only announces newly arrived unread notifications', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(NotificationService);
    const http = TestBed.inject(HttpTestingController);

    const respond = async (notifications: UserNotification[]) => {
      const refresh = service.refresh();
      http.expectOne((request) => request.url === '/api/notifications').flush({ notifications });
      http.expectOne('/api/notifications/unread-count').flush({ unreadCount: notifications.filter((entry) => !entry.readAt).length });
      await refresh;
    };

    await respond([notification(5)]);
    expect(service.latestIncoming()).toBeNull();

    await respond([notification(5)]);
    expect(service.latestIncoming()).toBeNull();

    await respond([notification(6), notification(5)]);
    expect(service.latestIncoming()?.id).toBe(6);

    await respond([notification(7, '2026-11-25T12:01:00.000Z'), notification(6)]);
    expect(service.latestIncoming()?.id).toBe(6);

    service.stop();
    expect(service.latestIncoming()).toBeNull();
    http.verify();
  });
});
