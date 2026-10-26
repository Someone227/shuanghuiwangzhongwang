import { ref } from 'vue';

/** 站点主题：浅色 = E 青绿，深色 = C 午夜 AI */
export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'nengshenma:theme';

function readInitial(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* 隐私模式下 localStorage 可能抛错，忽略即可 */
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function apply(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.dataset.theme = mode;
  root.classList.add('theme-anim');
  window.setTimeout(() => root.classList.remove('theme-anim'), 220);
}

const mode = ref<ThemeMode>(readInitial());

export function initTheme(): void {
  apply(mode.value);
}

export function setTheme(next: ThemeMode): void {
  mode.value = next;
  apply(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 存不了也不影响当次切换 */
  }
}

export function toggleTheme(): void {
  setTheme(mode.value === 'dark' ? 'light' : 'dark');
}

export function useTheme() {
  return { mode, setTheme, toggleTheme };
}
