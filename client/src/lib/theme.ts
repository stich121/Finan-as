export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "financas-theme";

export function getStoredTheme(): ThemePreference {
  return (localStorage.getItem(STORAGE_KEY) as ThemePreference) ?? "system";
}

export function applyTheme(theme: ThemePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem(STORAGE_KEY, theme);
}
