import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LOGIN_PATH } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/users/user.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { Icon, type IconName } from '../../shared/icon/icon';

interface NavigationEntry {
  readonly label: string;
  readonly icon: IconName;
  // Sin ruta: la sección todavía no existe y se muestra deshabilitada, como en la maqueta.
  readonly path?: string;
  readonly isAdminOnly?: boolean;
}

const NAVIGATION: readonly NavigationEntry[] = [
  { label: 'Inicio', icon: 'home', path: '/' },
  { label: 'Mis tareas', icon: 'flag', path: '/mis-tareas' },
  { label: 'Calendario', icon: 'calendar' },
  { label: 'Documentos', icon: 'file' },
  { label: 'Reportes', icon: 'chart' },
  { label: 'Usuarios', icon: 'users', path: '/usuarios', isAdminOnly: true },
  { label: 'Sincronización', icon: 'sync', path: '/sincronizacion', isAdminOnly: true },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly notificationService = inject(NotificationService);
  protected readonly isNotificationPanelOpen = signal(false);

  protected readonly user = this.auth.currentUser;
  protected readonly navigation = computed(() =>
    NAVIGATION.filter((entry) => !entry.isAdminOnly || this.auth.hasRole('ADMIN')),
  );
  protected readonly roleSummary = computed(
    () =>
      this.user()
        ?.roles.map((role) => ROLE_LABELS[role])
        .join(' · ') ?? '',
  );

  protected async logOut(): Promise<void> {
    this.notificationService.stop();
    await this.auth.logOut();
    await this.router.navigateByUrl(LOGIN_PATH);
  }

  protected toggleNotifications(): void {
    this.isNotificationPanelOpen.update((isOpen) => !isOpen);
  }

  protected async openNotification(notificationId: number, workflowId: number): Promise<void> {
    await this.notificationService.markRead(notificationId);
    this.isNotificationPanelOpen.set(false);
    await this.router.navigate(['/workflows', workflowId]);
  }

  constructor() {
    void this.notificationService.start();
  }
}
