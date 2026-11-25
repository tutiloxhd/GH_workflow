import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

const PAGE_SIZES = [10, 20, 50, 100] as const;

@Component({
  selector: 'app-list-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="list-pagination" aria-label="Paginación">
      <label>
        Mostrar
        <select #size [value]="pageSize()" (change)="selectPageSize(size.value)">
          @for (value of pageSizes; track value) {
            <option [value]="value">{{ value }}</option>
          }
        </select>
      </label>
      <span>Página {{ currentPage() }} de {{ totalPages() }}</span>
      <div class="page-numbers">
        @for (page of pages(); track page; let index = $index) {
          @if (index > 0 && page - pages()[index - 1] > 1) {
            <span class="page-gap" aria-hidden="true">…</span>
          }
          <button
            type="button"
            [class.active]="page === currentPage()"
            [attr.aria-current]="page === currentPage() ? 'page' : null"
            [attr.aria-label]="'Ir a la página ' + page"
            [disabled]="isLoading()"
            (click)="selectPage(page)"
          >{{ page }}</button>
        }
      </div>
    </nav>
  `,
  styles: `
    .list-pagination { display:flex;align-items:center;justify-content:flex-end;gap:16px;padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:.75rem }
    label,.page-numbers { display:flex;align-items:center;gap:8px }
    select { min-height:40px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface) }
    button { display:grid;width:40px;height:40px;place-items:center;border:1px solid var(--line);border-radius:8px;background:var(--surface);font-weight:700;cursor:pointer }
    button:hover { background:var(--hover) }
    button.active { border-color:var(--navy);background:var(--navy);color:#fff }
    button:disabled { cursor:wait;opacity:.6 }
    .page-gap { min-width:18px;text-align:center }
    @media(max-width:640px){.list-pagination{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}.page-numbers{grid-column:1/-1;justify-content:center;flex-wrap:wrap}label{justify-self:start}}
  `,
})
export class ListPagination {
  readonly total = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly offset = input.required<number>();
  readonly isLoading = input(false);
  readonly offsetChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly currentPage = computed(() => Math.floor(this.offset() / this.pageSize()) + 1);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly pages = computed(() => {
    const current = this.currentPage();
    const total = this.totalPages();
    return [...new Set([1, current - 2, current - 1, current, current + 1, current + 2, total])]
      .filter((page) => page >= 1 && page <= total)
      .sort((left, right) => left - right);
  });

  protected selectPage(page: number): void {
    if (page !== this.currentPage()) this.offsetChange.emit((page - 1) * this.pageSize());
  }

  protected selectPageSize(value: string): void {
    this.pageSizeChange.emit(Number(value));
  }
}
