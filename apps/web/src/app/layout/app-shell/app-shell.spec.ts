import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { AppShell } from './app-shell';

describe('AppShell mobile menu', () => {
  it('opens as a dialog and returns focus to its trigger when it closes', async () => {
    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal(null), hasRole: () => false } },
        { provide: NotificationService, useValue: { start: () => undefined } },
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
});
