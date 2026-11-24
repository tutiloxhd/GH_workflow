import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Holiday {
  readonly date: string;
  readonly name: string;
  readonly isInalienable: boolean;
  readonly source: 'BOOSTR' | 'MANUAL';
}

export interface HolidayYear {
  readonly year: number;
  readonly holidays: readonly Holiday[];
  // false si la API no tiene fuente externa de feriados: solo ingreso manual.
  readonly canSync: boolean;
}

const BASE_URL = '/api/holidays';

@Injectable({ providedIn: 'root' })
export class HolidaysApiService {
  private readonly http = inject(HttpClient);

  list(year: number): Promise<HolidayYear> {
    return firstValueFrom(this.http.get<HolidayYear>(BASE_URL, { params: { year } }));
  }

  sync(year: number): Promise<HolidayYear> {
    return firstValueFrom(this.http.post<HolidayYear>(`${BASE_URL}/sync`, { year }));
  }

  add(holiday: Omit<Holiday, 'source'>): Promise<HolidayYear> {
    return firstValueFrom(this.http.post<HolidayYear>(BASE_URL, holiday));
  }

  async remove(date: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE_URL}/${date}`));
  }
}
