import React, { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(getStoredTheme());

    function handleThemeChange(event: Event) {
      const detail = (event as CustomEvent<{ theme: Theme }>).detail;
      if (detail?.theme) {
        setTheme(detail.theme);
      }
    }

    window.addEventListener('themechange', handleThemeChange);
    return () => {
      window.removeEventListener('themechange', handleThemeChange);
    };
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      data-sim-obstacle="header"
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {theme === 'dark' ? '☀' : '☾'}
      </span>
    </button>
  );
}
