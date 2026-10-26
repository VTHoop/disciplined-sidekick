import {
  parseTarget,
  resolveTargets,
  type TargetField,
} from "@disciplined-sidekick/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { TargetsStore } from "./targets-store";

const FIELDS: { field: TargetField; name: string; label: string }[] = [
  { field: "calories", name: "Calories", label: "Calories (kcal)" },
  { field: "protein", name: "Protein", label: "Protein (g)" },
  { field: "fruitVeg", name: "Fruit/veg", label: "Fruit/veg (g)" },
];

type Values = Record<TargetField, number | null>;

interface FieldState {
  text: string;
  error: string | null;
  saved: boolean;
}

type FieldStates = Record<TargetField, FieldState>;

const asText = (value: number | null) => (value === null ? "" : String(value));

export function SettingsScreen({ targets }: { targets: TargetsStore }) {
  const [stored, setStored] = useState<Values | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fields, setFields] = useState<FieldStates | null>(null);

  useEffect(() => {
    let active = true;
    targets.load().then(
      (row) => {
        if (!active) return;
        const values = resolveTargets(row);
        setStored(values);
        setFields({
          calories: {
            text: asText(values.calories),
            error: null,
            saved: false,
          },
          protein: { text: asText(values.protein), error: null, saved: false },
          fruitVeg: {
            text: asText(values.fruitVeg),
            error: null,
            saved: false,
          },
        });
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

  async function onBlur(field: TargetField, name: string) {
    if (!fields || !stored) return;
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
    try {
      await targets.save(field, parsed.value);
    } catch {
      update(field, {
        error: `Couldn't save ${name}. Check your connection and try again.`,
        saved: false,
      });
      return;
    }
    setStored((current) =>
      current ? { ...current, [field]: parsed.value } : current,
    );
    update(field, { error: null, saved: true });
  }

  return (
    <main>
      <h1>Settings</h1>
      <p>
        <Link to="/">Today</Link>
      </p>
      {loadFailed && (
        <p role="alert">Couldn't load your targets. Reload to try again.</p>
      )}
      {!loadFailed && !fields && <p role="status">Loading…</p>}
      {fields && (
        <form onSubmit={(event) => event.preventDefault()}>
          <h2>Daily targets</h2>
          {FIELDS.map(({ field, name, label }) => {
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
                  onBlur={() => onBlur(field, name)}
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
    </main>
  );
}
