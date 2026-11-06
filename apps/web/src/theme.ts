/** The theme choice: kept on this device only, never sent to the server. */

export type Theme = "light" | "dark" | "system";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];
export const THEME_KEY = "theme";

const SCHEMES = ["light", "dark"] as const;

const isTheme = (value: unknown): value is Theme =>
  THEMES.includes(value as Theme);

/** The stored choice; System when nothing valid is stored or storage is blocked. */
export function readTheme(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    const value = storage.getItem(THEME_KEY);
    return isTheme(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Storage can be full or blocked; the choice still applies for this session. */
export function saveTheme(
  theme: Theme,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // Nothing to do: the choice applies now and is forgotten on reload.
  }
}

/**
 * Light and Dark pin the page with `data-theme` (see tokens.css) and switch off
 * the other `theme-color` meta, so the Android status bar follows the choice.
 * System removes both and lets the device's colour scheme decide.
 * `index.html` runs the same steps before first paint.
 */
export function applyTheme(theme: Theme, doc: Document = document) {
  const root = doc.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;

  for (const scheme of SCHEMES) {
    const meta = doc.querySelector(
      `meta[name="theme-color"][data-scheme="${scheme}"]`,
    );
    if (!meta) continue;
    if (theme === "system")
      meta.setAttribute("media", `(prefers-color-scheme: ${scheme})`);
    else meta.setAttribute("media", theme === scheme ? "all" : "not all");
  }
}
