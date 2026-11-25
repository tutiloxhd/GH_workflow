import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Trazos tomados del sprite de la maqueta (references/demoweb/shell.js).
const ICON_PATHS = {
  home: ['M3 11 12 3l9 8v9H15v-7H9v7H3z'],
  hammer: ['m14 5 5 5M12 7l5 5M3 21l9-9M5 7l4-4 8 8-4 4z'],
  flag: ['M5 21V4M5 4h12l-2 4 2 4H5'],
  calendar: [
    'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M8 3v4M16 3v4M3 10h18',
  ],
  file: ['M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6'],
  chart: ['M4 20V10M9 20V5M14 20v-8M19 20V3M2 20h20'],
  users: [
    'M6 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    'M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5',
  ],
  search: ['M4 11a7 7 0 1 0 14 0 7 7 0 1 0-14 0', 'm20 20-4-4'],
  filter: ['M4 5h16M7 12h10M10 19h4'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  logout: ['M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 1 0 0 7',
    'M19 13.5a7 7 0 0 0 0-3l2-1.5-2-3.5-2.3 1a7 7 0 0 0-2.6-1.5L14 2.5h-4L9.9 5a7 7 0 0 0-2.6 1.5L5 5.5 3 9l2 1.5a7 7 0 0 0 0 3L3 15l2 3.5 2.3-1a7 7 0 0 0 2.6 1.5l.1 2.5h4l.1-2.5a7 7 0 0 0 2.6-1.5l2.3 1 2-3.5z',
  ],
  // Flechas en círculo (sincronización); trazo propio, en el mismo estilo de la maqueta.
  sync: ['M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3', 'M18 3v4h-4M6 21v-4h4'],
} as const;

export type IconName = keyof typeof ICON_PATHS;

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'icon-host', 'aria-hidden': 'true' },
  template: `
    <svg class="icon" viewBox="0 0 24 24" focusable="false">
      @for (path of paths(); track $index) {
        <path [attr.d]="path" />
      }
    </svg>
  `,
  styles: ':host { display: inline-flex; }',
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly paths = computed(() => ICON_PATHS[this.name()]);
}
