import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let isDark = false;
  let onSystemChange: (() => void) | undefined;

  beforeEach(() => {
    localStorage.removeItem('gh-theme');
    document.documentElement.dataset['theme'] = 'light';
    isDark = false;
    onSystemChange = undefined;
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return isDark; },
      addEventListener: (_event: string, listener: () => void) => { onSystemChange = listener; },
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('gh-theme');
    document.documentElement.dataset['theme'] = 'light';
  });

  it('follows the system until the user chooses a theme', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('system');
    expect(theme.isDark()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');

    isDark = true;
    onSystemChange?.();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(theme.isDark()).toBe(true);

    theme.setPreference('light');
    expect(localStorage.getItem('gh-theme')).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(theme.isDark()).toBe(false);

    theme.setPreference('system');
    expect(localStorage.getItem('gh-theme')).toBeNull();
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
