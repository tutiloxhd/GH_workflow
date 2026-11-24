import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { HolidaysApiService, type Holiday } from '../../core/holidays/holidays-api.service';
import { santiagoDayKey } from '../../core/time/santiago-time';

const weekdayFormatter = new Intl.DateTimeFormat('es-CL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

// Feriados usados para contar los plazos en días hábiles.
@Component({
  selector: 'app-holidays-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './holidays-page.html',
  styleUrl: './holidays-page.css',
})
export class HolidaysPage implements OnInit {
  private readonly api = inject(HolidaysApiService);

  protected readonly year = signal(Number(santiagoDayKey(new Date()).slice(0, 4)));
  protected readonly holidays = signal<readonly Holiday[]>([]);
  protected readonly canSync = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isBusy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly pendingDelete = signal<string | null>(null);

  protected newDate = '';
  protected newName = '';
  protected newIsInalienable = false;

  ngOnInit(): void {
    void this.load();
  }

  protected formatDay(date: string): string {
    const text = weekdayFormatter.format(new Date(`${date}T00:00:00Z`));
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  protected changeYear(step: number): void {
    this.year.update((year) => year + step);
    this.pendingDelete.set(null);
    this.notice.set(null);
    void this.load();
  }

  protected async sync(): Promise<void> {
    await this.run(async () => {
      const result = await this.api.sync(this.year());
      this.apply(result.holidays, result.canSync);
      this.notice.set(
        `Se sincronizaron ${String(result.holidays.length)} feriados de ${String(this.year())}.`,
      );
    });
  }

  protected async add(): Promise<void> {
    const name = this.newName.trim();
    if (!this.newDate || !name) {
      this.errorMessage.set('Indica la fecha y el nombre del feriado.');
      return;
    }
    await this.run(async () => {
      await this.api.add({ date: this.newDate, name, isInalienable: this.newIsInalienable });
      const addedYear = Number(this.newDate.slice(0, 4));
      this.notice.set(`Feriado agregado: ${this.formatDay(this.newDate)} ${String(addedYear)}.`);
      this.newDate = '';
      this.newName = '';
      this.newIsInalienable = false;
      this.year.set(addedYear);
      await this.load();
    });
  }

  protected async remove(date: string): Promise<void> {
    await this.run(async () => {
      await this.api.remove(date);
      this.pendingDelete.set(null);
      this.notice.set('Feriado eliminado.');
      await this.load();
    });
  }

  private async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.api.list(this.year());
      this.apply(result.holidays, result.canSync);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }

  private apply(holidays: readonly Holiday[], canSync: boolean): void {
    this.holidays.set(holidays);
    this.canSync.set(canSync);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.notice.set(null);
    try {
      await action();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isBusy.set(false);
    }
  }
}
