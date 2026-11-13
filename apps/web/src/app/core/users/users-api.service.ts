import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RoleCode, User, UserEnvelope } from './user.model';

export interface UserPage {
  readonly users: readonly User[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface NewUser {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly roles: readonly RoleCode[];
}

const USERS_URL = '/api/users';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);

  list(query: {
    search: string;
    limit: number;
    offset: number;
    role?: RoleCode;
  }): Promise<UserPage> {
    let params = new HttpParams().set('limit', query.limit).set('offset', query.offset);
    if (query.search) params = params.set('search', query.search);
    if (query.role) params = params.set('role', query.role);
    return firstValueFrom(this.http.get<UserPage>(USERS_URL, { params }));
  }

  async create(newUser: NewUser): Promise<User> {
    const { user } = await firstValueFrom(this.http.post<UserEnvelope>(USERS_URL, newUser));
    return user;
  }

  async replaceRoles(userId: number, roles: readonly RoleCode[]): Promise<User> {
    const { user } = await firstValueFrom(
      this.http.put<UserEnvelope>(`${USERS_URL}/${userId}/roles`, { roles }),
    );
    return user;
  }

  async deactivate(userId: number): Promise<User> {
    const { user } = await firstValueFrom(
      this.http.post<UserEnvelope>(`${USERS_URL}/${userId}/deactivate`, null),
    );
    return user;
  }

  async activate(userId: number): Promise<User> {
    const { user } = await firstValueFrom(
      this.http.post<UserEnvelope>(`${USERS_URL}/${userId}/activate`, null),
    );
    return user;
  }
}
