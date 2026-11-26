import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { ThemeService } from '../../core/theme/theme.service';
import { AppShell } from './app-shell';

describe('AppShell mobile menu', () => {
  it('opens as a dialog and returns focus to its trigger when it closes', async () => {
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal(null), hasRole: () => false } },
        { provide: NotificationService, useValue: { start: () => undefined, latestIncoming: signal(null) } },
        { provide: ThemeService, useValue: { isDark: signal(false), setPreference: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector<HTMLButtonElement>('.mobile-menu-button');
    const dialog = root.querySelector<HTMLDialogElement>('.mobile-menu');
    if (!trigger || !dialog) throw new Error('Missing mobile navigation controls');
    const showModal = vi.fn();
    dialog.showModal = showModal;
    const focus = vi.spyOn(trigger, 'focus');

    trigger.click();
    expect(showModal).toHaveBeenCalledOnce();

    dialog.dispatchEvent(new Event('close'));
    await fixture.whenStable();
    expect(focus).toHaveBeenCalledOnce();
  });

  it('sends task notifications to Mis tareas with a task link', async () => {
    const markRead = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ id: 1, name: 'Usuario', email: 'usuario@example.test', roles: ['MANAGER'] }), hasRole: () => false } },
        { provide: NotificationService, useValue: {
          start: () => undefined,
          markRead,
          notifications: signal([{ id: 8, workflowId: 12, taskId: 34, trigger: 'TASK_ASSIGNED', title: 'Tarea asignada', body: 'Tarea sintética', readAt: null }]),
          hasUnread: signal(true),
          unreadCount: signal(1),
          latestIncoming: signal(null),
        } },
        { provide: ThemeService, useValue: { isDark: signal(false), setPreference: () => undefined } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.notification-button')?.click();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('.notification-entry')?.click();
    await fixture.whenStable();

    expect(markRead).toHaveBeenCalledWith(8);
    expect(navigate).toHaveBeenCalledWith(['/mis-tareas'], {
      queryParams: { workflow: 12, task: 34 },
    });
  });

  it('lets the mobile menu switch the theme', async () => {
    const isDark = signal(false);
    const setPreference = vi.fn((preference: 'light' | 'dark') => isDark.set(preference === 'dark'));
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal(null), hasRole: () => false } },
        { provide: NotificationService, useValue: { start: () => undefined, latestIncoming: signal(null) } },
        { provide: ThemeService, useValue: { isDark, setPreference } },
      ],
    });
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const menu = (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('.mobile-menu');
    const switchButton = menu?.querySelector<HTMLButtonElement>('button[role="switch"]');
    if (!menu || !switchButton) throw new Error('Falta el switch móvil');
    expect(switchButton.getAttribute('aria-checked')).toBe('false');

    switchButton.click();
    await fixture.whenStable();
    expect(setPreference).toHaveBeenCalledWith('dark');
    expect(switchButton.getAttribute('aria-checked')).toBe('true');
  });

  it('opens a floating notification through the same task link', async () => {
    const latestIncoming = signal<{
      id: number; workflowId: number; taskId: number; title: string; body: string;
    } | null>(null);
    const markRead = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal(null), hasRole: () => false } },
        { provide: NotificationService, useValue: { start: () => undefined, latestIncoming, markRead } },
        { provide: ThemeService, useValue: { isDark: signal(false), setPreference: () => undefined } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.floating-notification')).toBeNull();

    latestIncoming.set({ id: 9, workflowId: 12, taskId: 34, title: 'Tarea nueva', body: 'Revisar tarea' });
    await fixture.whenStable();
    const notice = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.floating-notification');
    expect(notice?.textContent).toContain('Tarea nueva');
    notice?.querySelector<HTMLButtonElement>('.floating-notification-open')?.click();
    await fixture.whenStable();

    expect(markRead).toHaveBeenCalledWith(9);
    expect(navigate).toHaveBeenCalledWith(['/mis-tareas'], {
      queryParams: { workflow: 12, task: 34 },
    });
    expect(fixture.nativeElement.querySelector('.floating-notification')).toBeNull();
  });
});
