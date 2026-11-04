import {
  entryTotals,
  type FoodPreview,
  type ResolvedTargets,
  type Totals,
} from "@disciplined-sidekick/core";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { FoodApi } from "../food/food-api";
import { FoodLog } from "../food/food-log";
import type { DayEntriesStore, DayEntry } from "./entries-store";
import { EntryList, itemKey, newestFirst } from "./entry-list";
import { PriceCard } from "./price-card";
import type { SharedTargets } from "./shared-targets";
import { useDay } from "./use-day";
import { useOnline } from "./use-online";
import { useTargets } from "./use-targets";
import "./today.css";

const LOAD_FAILED = "Couldn't load today's totals.";
const LOADING = "Loading today…";
const NOTHING_LOGGED = "Nothing logged yet. Type what you ate below.";

const heading = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

const LEAVE_MS = 160;
const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const asEntry = (preview: FoodPreview, loggedAt: Date): DayEntry => ({
  id: preview.entryId,
  text: preview.text,
  loggedAt: loggedAt.toISOString(),
  // The saved fields only: what the lookup derived (per-100 g values, FDC id, path, source) stays behind.
  items: preview.items.map(
    (
      { kcalPer100g, proteinPer100g, fdcId, path, source, ...item },
      position,
    ) => ({
      position,
      ...item,
    }),
  ),
});

type Loaded =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      entries: DayEntry[];
      totals: Totals;
      targets: ResolvedTargets;
    };

/** Today: the date, the three pillars against their targets, the day's entries and the composer. */
export function TodayScreen({
  food,
  entries,
  targets,
}: {
  food: FoodApi;
  entries: DayEntriesStore;
  targets: SharedTargets;
}) {
  const day = useDay(entries);
  const tgt = useTargets(targets);
  const online = useOnline();
  // Items whose delete succeeded and whose row is still leaving.
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const focusAfter = useRef<string | "list" | null>(null);

  const deleteItem = async (entryId: string, position: number) => {
    await entries.deleteItem(entryId, position);
    const shown =
      day.state.status === "ready"
        ? newestFirst(day.state.entries).flatMap((e) =>
            e.items.map((i) => itemKey(e.id, i.position)),
          )
        : [];
    const key = itemKey(entryId, position);
    const at = shown.indexOf(key);
    focusAfter.current = shown[at + 1] ?? shown[at - 1] ?? "list";
    const finish = () => {
      day.remove(entryId, position);
      setLeaving((s) => new Set([...s].filter((k) => k !== key)));
    };
    setLeaving((s) => new Set(s).add(key));
    if (prefersReducedMotion()) finish();
    else setTimeout(finish, LEAVE_MS);
  };

  const days = day.state.status === "ready" ? day.state.entries : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the entries change
  useEffect(() => {
    const target = focusAfter.current;
    if (!target || leaving.size > 0) return;
    focusAfter.current = null;
    const el =
      target === "list"
        ? document.getElementById("logged-today")
        : document.querySelector<HTMLElement>(`[data-delete="${target}"]`);
    el?.focus();
  }, [days, leaving]);

  const loaded: Loaded =
    day.state.status === "error" || tgt.state.status === "error"
      ? { status: "error" }
      : day.state.status === "ready" && tgt.state.status === "ready"
        ? {
            status: "ready",
            entries: day.state.entries,
            totals: entryTotals(
              day.state.entries.flatMap((e) =>
                e.items.filter((i) => !leaving.has(itemKey(e.id, i.position))),
              ),
            ),
            targets: tgt.state.targets,
          }
        : { status: "loading" };

  const retry = () => {
    if (day.state.status === "error") day.retry();
    if (tgt.state.status === "error") tgt.retry();
  };

  return (
    <main className="today">
      <header className="today-header">
        <h1>{heading(day.date)}</h1>
        <Link to="/settings" className="today-settings">
          Settings
        </Link>
      </header>

      {loaded.status === "loading" && <p role="status">{LOADING}</p>}
      {loaded.status === "error" && (
        <div role="alert" className="today-error">
          <p>{LOAD_FAILED}</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {loaded.status === "ready" && (
        <>
          <PriceCard totals={loaded.totals} targets={loaded.targets} />
          <section aria-labelledby="logged-today">
            <h2 id="logged-today" tabIndex={-1}>
              Logged today
            </h2>
            {loaded.entries.length === 0 ? (
              <p>{NOTHING_LOGGED}</p>
            ) : (
              <EntryList
                entries={loaded.entries}
                online={online}
                leaving={leaving}
                onDelete={deleteItem}
              />
            )}
          </section>
        </>
      )}

      <div className="today-composer" data-composer>
        <FoodLog
          api={food}
          onSaved={(preview, date, loggedAt) =>
            day.add(asEntry(preview, loggedAt), date)
          }
          renderCard={(preview) => {
            if (loaded.status === "error") {
              return <p className="today-error">{LOAD_FAILED}</p>;
            }
            if (loaded.status === "loading") {
              return <p role="status">{LOADING}</p>;
            }
            return (
              <PriceCard
                totals={loaded.totals}
                targets={loaded.targets}
                entry={preview.totals}
              />
            );
          }}
        />
      </div>
    </main>
  );
}
