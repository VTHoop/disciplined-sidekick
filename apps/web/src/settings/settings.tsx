import {
  parseTarget,
  resolveTargets,
  type TargetField,
  targetName,
} from "@disciplined-sidekick/core";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { appVersion } from "../app-info";
import { useAuth } from "../auth/auth-context";
import type { TargetsStore } from "./targets-store";
import { ThemeSwitcher } from "./theme-switcher";
import "./settings.css";

const FIELDS: { field: TargetField; label: string }[] = [
  { field: "calories", label: "Calories (kcal)" },
  { field: "protein", label: "Protein (g)" },
  { field: "fruitVeg", label: "Fruit/veg (g)" },
];

type Values = Record<TargetField, number | null>;

interface FieldState {
  text: string;
  error: string | null;
  saved: boolean;
}

type FieldStates = Record<TargetField, FieldState>;

const asText = (value: number | null) => (value === null ? "" : String(value));

const initialStates = (values: Values): FieldStates =>
  Object.fromEntries(
    FIELDS.map(({ field }) => [
      field,
      { text: asText(values[field]), error: null, saved: false },
    ]),
  ) as FieldStates;

export function SettingsScreen({ targets }: { targets: TargetsStore }) {
  const { signOut } = useAuth();
  const [stored, setStored] = useState<Values | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fields, setFields] = useState<FieldStates | null>(null);
  // The latest committed text, and a per-field count of saves started, so a save
  // that is no longer the newest cannot overwrite the result of a newer one.
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const saveCount = useRef<Record<TargetField, number>>({
    calories: 0,
    protein: 0,
    fruitVeg: 0,
  });

  useEffect(() => {
    let active = true;
    targets.load().then(
      (row) => {
        if (!active) return;
        const values = resolveTargets(row);
        setStored(values);
        setFields(initialStates(values));
      },
      () => active && setLoadFailed(true),
    );
    return () => {
      active = false;
    };
  }, [targets]);

  const update = (field: TargetField, patch: Partial<FieldState>) =>
    setFields((current) =>
      current
        ? { ...current, [field]: { ...current[field], ...patch } }
        : current,
    );

  async function onBlur(field: TargetField) {
    if (!fields || !stored) return;
    // Untouched text is never re-validated, so a value stored above a later-lowered cap stays as it is.
    if (fields[field].text.trim() === asText(stored[field])) {
      update(field, { error: null });
      return;
    }
    const parsed = parseTarget(field, fields[field].text);
    if (!parsed.ok) {
      update(field, { error: parsed.message, saved: false });
      return;
    }
    // Compared with what is stored, not what was last typed, so a failed save is retried.
    if (parsed.value === stored[field]) {
      update(field, { error: null });
      return;
    }
    const count = ++saveCount.current[field];
    const isLatest = () => saveCount.current[field] === count;
    try {
      await targets.save(field, parsed.value);
    } catch {
      if (isLatest()) {
        update(field, {
          error: `Couldn't save ${targetName(field)}. Check your connection and try again.`,
          saved: false,
        });
      }
      return;
    }
    if (!isLatest()) return;
    setStored((current) =>
      current ? { ...current, [field]: parsed.value } : current,
    );
    // Typing during the save means the box no longer matches what was saved.
    const now = parseTarget(field, fieldsRef.current?.[field].text ?? "");
    update(field, {
      error: null,
      saved: now.ok && now.value === parsed.value,
    });
  }

  return (
    <main>
      <header className="settings-header">
        <h1>Settings</h1>
        <Link to="/" className="settings-home" aria-label="Home">
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M3 11 L12 3 L21 11 M5 9.5 V20 H19 V9.5 M10 20 V14 H14 V20" />
          </svg>
        </Link>
      </header>
      <ThemeSwitcher />
      {loadFailed && (
        <p role="alert">Couldn't load your targets. Reload to try again.</p>
      )}
      {!loadFailed && !fields && <p role="status">Loading…</p>}
      {fields && (
        <form onSubmit={(event) => event.preventDefault()}>
          <h2>Daily targets</h2>
          {FIELDS.map(({ field, label }) => {
            const state = fields[field];
            const id = `target-${field}`;
            return (
              <div key={field} className="field">
                <label htmlFor={id}>{label}</label>
                <input
                  id={id}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={state.text}
                  aria-invalid={state.error ? true : undefined}
                  aria-describedby={state.error ? `${id}-error` : undefined}
                  onChange={(event) =>
                    update(field, { text: event.target.value, saved: false })
                  }
                  onBlur={() => onBlur(field)}
                />
                {state.error && (
                  <p id={`${id}-error`} role="alert">
                    {state.error}
                  </p>
                )}
                <p role="status" className="saved">
                  {state.saved ? "Saved" : ""}
                </p>
              </div>
            );
          })}
        </form>
      )}
      <button type="button" onClick={signOut}>
        Sign out
      </button>
      <p className="app-version">App version: {appVersion()}</p>
    </main>
  );
}
