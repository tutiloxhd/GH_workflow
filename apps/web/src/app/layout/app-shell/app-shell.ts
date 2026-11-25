import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { LOGIN_PATH } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/users/user.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { ThemeService } from '../../core/theme/theme.service';
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
  { label: 'Sin workflow', icon: 'home', path: '/propiedades-sin-workflow', isAdminOnly: true },
  { label: 'Calendario', icon: 'calendar' },
  { label: 'Documentos', icon: 'file' },
  { label: 'Reportes', icon: 'chart' },
  { label: 'Panel de control', icon: 'settings', path: '/panel-de-control', isAdminOnly: true },
  { label: 'Flujos', icon: 'hammer', path: '/flujos', isAdminOnly: true },
  { label: 'Feriados', icon: 'calendar', path: '/feriados', isAdminOnly: true },
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
  private readonly mobileMenu = viewChild<ElementRef<HTMLDialogElement>>('mobileMenu');
  private readonly mobileMenuButton = viewChild<ElementRef<HTMLButtonElement>>('mobileMenuButton');
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map((event) => event.urlAfterRedirects),
    startWith(this.router.url),
  ));
  protected readonly notificationService = inject(NotificationService);
  protected readonly theme = inject(ThemeService);
  protected readonly isNotificationPanelOpen = signal(false);
  protected readonly isAccountMenuOpen = signal(false);

  protected readonly user = this.auth.currentUser;
  protected readonly pageTitle = computed(() => {
    const path = this.currentUrl()?.split('?')[0] ?? '/';
    if (path.startsWith('/workflows/')) return 'Remate';
    if (path.startsWith('/flujos/')) return 'Editar flujo';
    return ({
      '/': 'Remates',
      '/mis-tareas': 'Mis tareas',
      '/propiedades-sin-workflow': 'Propiedades sin workflow',
      '/panel-de-control': 'Panel de control',
      '/flujos': 'Flujos',
      '/feriados': 'Feriados',
      '/usuarios': 'Usuarios',
      '/sincronizacion': 'Sincronización',
    } as Record<string, string>)[path] ?? 'GrupoHouse';
  });
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
    this.isAccountMenuOpen.set(false);
    this.notificationService.stop();
    await this.auth.logOut();
    await this.router.navigateByUrl(LOGIN_PATH);
  }

  protected toggleNotifications(): void {
    this.isAccountMenuOpen.set(false);
    this.isNotificationPanelOpen.update((isOpen) => !isOpen);
  }

  protected toggleAccountMenu(): void {
    this.isNotificationPanelOpen.set(false);
    this.isAccountMenuOpen.update((isOpen) => !isOpen);
  }

  protected openMobileMenu(): void {
    this.isAccountMenuOpen.set(false);
    this.isNotificationPanelOpen.set(false);
    this.mobileMenu()?.nativeElement.showModal();
  }

  protected closeMobileMenu(): void {
    this.mobileMenu()?.nativeElement.close();
  }

  protected restoreMobileMenuFocus(): void {
    this.mobileMenuButton()?.nativeElement.focus();
  }

  protected async openNotification(
    notificationId: number,
    workflowId: number,
    taskId: number | null,
  ): Promise<void> {
    await this.notificationService.markRead(notificationId);
    this.isNotificationPanelOpen.set(false);
    await this.router.navigate(['/workflows', workflowId], {
      queryParams: taskId === null ? undefined : { task: taskId },
    });
  }

  constructor() {
    void this.notificationService.start();
  }
}
