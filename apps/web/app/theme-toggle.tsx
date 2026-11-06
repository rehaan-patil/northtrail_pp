'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

const THEME_KEY = 'northtrail-theme';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let saved: string | null = null;

    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      // Fall back to the operating system preference.
    }

    const initial: Theme =
      saved === 'dark' || saved === 'light'
        ? saved
        : getSystemTheme();

    setTheme(initial);
    applyTheme(initial);

    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(THEME_KEY)) return;
      } catch {
        // Continue following the system preference.
      }

      const next: Theme = event.matches ? 'dark' : 'light';

      setTheme(next);
      applyTheme(next);
    };

    media.addEventListener('change', handleSystemChange);

    return () => {
      media.removeEventListener('change', handleSystemChange);
    };
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';

    setTheme(next);
    applyTheme(next);

    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Theme still applies for the current session.
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun aria-hidden="true" />
      ) : (
        <Moon aria-hidden="true" />
      )}

      <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}