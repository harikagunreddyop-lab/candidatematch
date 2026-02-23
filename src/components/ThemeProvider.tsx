'use client';

import { createContext, useContext, useEffect } from 'react';

type Theme = 'dark';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const noop = () => {};

  return (
    <ThemeContext.Provider value={{ theme: 'dark', setTheme: noop, toggleTheme: noop }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
