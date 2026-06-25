export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'site-theme';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return 'dark';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

export function initTheme() {
  applyTheme(getStoredTheme());
}
