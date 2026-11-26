import { Injectable, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'gh-theme';

function savedPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = matchMedia('(prefers-color-scheme: dark)');
  private readonly selected = signal<ThemePreference>(savedPreference());
  private readonly dark = signal(false);
  readonly preference = this.selected.asReadonly();
  readonly isDark = this.dark.asReadonly();

  constructor() {
    this.apply();
    this.media.addEventListener('change', () => {
      if (this.selected() === 'system') this.apply();
    });
  }

  setPreference(preference: ThemePreference): void {
    this.selected.set(preference);
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // La preferencia sigue activa en esta sesión aunque el navegador bloquee el almacenamiento.
    }
    this.apply();
  }

  private apply(): void {
    const preference = this.selected();
    const isDark = preference === 'system' ? this.media.matches : preference === 'dark';
    this.dark.set(isDark);
    document.documentElement.dataset['theme'] = isDark ? 'dark' : 'light';
  }
}
