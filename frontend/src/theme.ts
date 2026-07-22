import { getSettings, saveSetting } from "./api";

export type Theme = "dark" | "light";

const THEME_KEY = "pos_theme";
const ACCENT_KEY = "pos_accent";

export const DEFAULT_THEME: Theme = "dark";
export const DEFAULT_ACCENT = "#e7890d";

/** Fallback profile colors used when the backend seed is unavailable. */
export const DEFAULT_PROFILE_COLORS: Record<string, string> = {
  Work: "#e7890d",
  Home: "#2FBF71",
  Family: "#3B82F6",
  Friends: "#A855F7",
};

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function applyAccent(accent: string): void {
  document.documentElement.style.setProperty("--accent", accent);
}

function readLocalTheme(): Theme | null {
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : null;
}

function readLocalAccent(): string | null {
  return localStorage.getItem(ACCENT_KEY);
}

function persistLocal(theme: Theme, accent: string): void {
  localStorage.setItem(THEME_KEY, theme);
  localStorage.setItem(ACCENT_KEY, accent);
}

/**
 * Resolve the initial theme + accent: localStorage wins, then backend
 * settings, then defaults. Applies them to :root immediately.
 */
export async function loadInitialSettings(): Promise<{ theme: Theme; accent: string }> {
  let theme: Theme = readLocalTheme() ?? DEFAULT_THEME;
  let accent: string = readLocalAccent() ?? DEFAULT_ACCENT;

  try {
    const settings = await getSettings();
    const map: Record<string, string> = {};
    for (const setting of settings) {
      map[setting.key] = setting.value;
    }
    if (!readLocalTheme() && (map.theme === "light" || map.theme === "dark")) {
      theme = map.theme;
    }
    if (!readLocalAccent() && typeof map.accent === "string" && map.accent.length > 0) {
      accent = map.accent;
    }
  } catch {
    console.warn("Could not load settings from backend; using local/defaults.");
  }

  applyTheme(theme);
  applyAccent(accent);
  return { theme, accent };
}

export async function setTheme(theme: Theme): Promise<void> {
  applyTheme(theme);
  persistLocal(theme, readLocalAccent() ?? DEFAULT_ACCENT);
  try {
    await saveSetting("theme", theme);
  } catch {
    console.warn("Could not persist theme to backend.");
  }
}

export async function setAccent(accent: string): Promise<void> {
  applyAccent(accent);
  persistLocal(readLocalTheme() ?? DEFAULT_THEME, accent);
  try {
    await saveSetting("accent", accent);
  } catch {
    console.warn("Could not persist accent to backend.");
  }
}
