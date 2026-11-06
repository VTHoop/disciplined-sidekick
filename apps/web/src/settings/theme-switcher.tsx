import { useState } from "react";
import { applyTheme, readTheme, saveTheme, type Theme } from "../theme";
import "./settings.css";

const OPTIONS: { theme: Theme; label: string }[] = [
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
  { theme: "system", label: "System" },
];

/** Native radios in a fieldset: arrow keys and screen-reader announcements come with them. */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  function choose(next: Theme) {
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  }

  return (
    <fieldset className="theme">
      <legend>Theme</legend>
      <div className="theme-options">
        {OPTIONS.map(({ theme: value, label }) => (
          <label key={value} className="theme-option">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => choose(value)}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
