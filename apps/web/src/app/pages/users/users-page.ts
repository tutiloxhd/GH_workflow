import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS, STATUS_LABELS, type User } from '../../core/users/user.model';
import { UsersApiService } from '../../core/users/users-api.service';
import { Icon } from '../../shared/icon/icon';
import { ConfirmStatusDialog } from './confirm-status-dialog';
import { CreateUserDialog } from './create-user-dialog';
import { EditRolesDialog } from './edit-roles-dialog';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-users-page',
  imports: [Icon, CreateUserDialog, EditRolesDialog, ConfirmStatusDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-page.html',
  styleUrl: './users-page.css',
})
export class UsersPage implements OnInit {
  private readonly usersApi = inject(UsersApiService);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly users = signal<readonly User[]>([]);
  protected readonly total = signal(0);
  protected readonly search = signal('');
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly isCreating = signal(false);
  protected readonly userEditingRoles = signal<User | null>(null);
  protected readonly userChangingStatus = signal<User | null>(null);

  private readonly ownId = inject(AuthService).currentUser()?.id;

  ngOnInit(): void {
    void this.load();
  }

  protected isSelf(user: User): boolean {
    return user.id === this.ownId;
  }

  protected onSearchInput(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), SEARCH_DEBOUNCE_MS);
  }

  protected async load(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const page = await this.usersApi.list({
        search: this.search().trim(),
        limit: PAGE_SIZE,
        offset: 0,
      });
      this.users.set(page.users);
      this.total.set(page.total);
    } catch (error) {
      this.loadError.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected onUserSaved(savedUser: User, message: string): void {
    const exists = this.users().some((user) => user.id === savedUser.id);
    this.users.update((users) =>
      exists
        ? users.map((user) => (user.id === savedUser.id ? savedUser : user))
        : [savedUser, ...users],
    );
    if (!exists) this.total.update((total) => total + 1);
    this.notice.set(message);
  }

  protected roleNames(user: User): string {
    return user.roles.map((role) => ROLE_LABELS[role]).join(', ') || 'Sin roles';
  }
}
