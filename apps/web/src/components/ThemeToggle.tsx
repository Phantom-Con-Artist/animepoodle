'use client';
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
type Theme = 'system' | 'light' | 'dark';
const order: Theme[] = ['system', 'light', 'dark'];
const labels: Record<Theme, string> = {
  system: 'Theme: match device',
  light: 'Theme: light',
  dark: 'Theme: dark',
};
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === 'light' || current === 'dark') setTheme(current);
  }, []);
  function cycle() {
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === 'system') localStorage.removeItem('animepoodle-theme');
      else localStorage.setItem('animepoodle-theme', next);
    } catch {}
  }
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button
      className="theme-toggle"
      onClick={cycle}
      aria-label={`${labels[theme]}. Switch theme`}
      title={labels[theme]}
    >
      <Icon size={17} strokeWidth={2.4} />
      <span>{theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}</span>
    </button>
  );
}
