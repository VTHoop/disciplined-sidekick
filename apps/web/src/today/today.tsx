import {
  entryTotals,
  type FoodPreview,
  type ResolvedTargets,
  type Totals,
} from "@disciplined-sidekick/core";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/auth-context";
import { fullDay, shortDay } from "../day-label";
import type { FoodApi } from "../food/food-api";
import { FoodLog } from "../food/food-log";
import type { DayEntriesStore, DayEntry } from "./entries-store";
import { EntryList, itemKey, newestFirst } from "./entry-list";
import { PriceCard } from "./price-card";
import type { SharedTargets } from "./shared-targets";
import { useDay } from "./use-day";
import { useOnline } from "./use-online";
import { useTargets } from "./use-targets";
import type { ViewedDay } from "./use-viewed-day";
import "./today.css";

const LOAD_FAILED = "Couldn't load this day's totals.";
const LOADING = "Loading…";
const NOTHING_LOGGED = "Nothing logged yet. Type what you ate below.";

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

/** The sheet's card when the view has moved off the sheet's day: it loads that day itself. */
function SheetDayCard({
  entries,
  day,
  targets,
  entry,
}: {
  entries: DayEntriesStore;
  day: string;
  targets: ResolvedTargets | null;
  entry: Totals;
}) {
  const { state } = useDay(entries, day);
  if (state.status === "error") {
    return <p className="today-error">{LOAD_FAILED}</p>;
  }
  if (state.status !== "ready" || !targets) {
    return <p role="status">{LOADING}</p>;
  }
  return (
    <PriceCard
      totals={entryTotals(state.entries.flatMap((e) => e.items))}
      targets={targets}
      entry={entry}
    />
  );
}

/**
 * Today: the viewed day's heading with its Previous day, Next day and Settings
 * controls, the three pillars against their targets, that day's entries and
 * the composer, which logs to the viewed day.
 */
export function TodayScreen({
  food,
  entries,
  targets,
  viewed,
}: {
  food: FoodApi;
  entries: DayEntriesStore;
  targets: SharedTargets;
  viewed: ViewedDay;
}) {
  const { signOut } = useAuth();
  const day = useDay(entries, viewed.date);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Empty until the day changes, so opening Today announces nothing.
  const [announcement, setAnnouncement] = useState("");
  const shownDate = useRef(viewed.date);
  useEffect(() => {
    if (shownDate.current === viewed.date) return;
    shownDate.current = viewed.date;
    setAnnouncement(fullDay(viewed.date));
  }, [viewed.date]);
  const tgt = useTargets(targets);
  const online = useOnline();
  // Items whose delete succeeded and whose row is still leaving.
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const focusAfter = useRef<string | "list" | null>(null);

  const deleteItem = async (entryId: string, position: number) => {
    // The focus target is read before the await, from the list the user saw.
    const shown =
      day.state.status === "ready"
        ? newestFirst(day.state.entries).flatMap((e) =>
            e.items.map((i) => itemKey(e.id, i.position)),
          )
        : [];
    const key = itemKey(entryId, position);
    const at = shown.indexOf(key);
    const next = shown[at + 1] ?? shown[at - 1] ?? "list";
    await entries.deleteItem(entryId, position);
    focusAfter.current = next;
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
        ? document.getElementById("food-journal")
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
        <div className="today-title">
          <h1 ref={headingRef} tabIndex={-1}>
            <span data-short-date aria-hidden="true">
              {shortDay(viewed.date, viewed.today)}
            </span>
            <span className="sr-only">{fullDay(viewed.date)}</span>
          </h1>
          {!viewed.isToday && (
            <button
              type="button"
              className="today-back"
              onClick={() => {
                // Focus lands on the heading, which reads the date; the status region stays quiet.
                shownDate.current = viewed.today;
                viewed.backToToday();
                headingRef.current?.focus();
              }}
            >
              Back to today
            </button>
          )}
        </div>
        <button
          type="button"
          className="today-day-button"
          aria-label="Previous day"
          onClick={viewed.previous}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        {/* aria-disabled, not disabled: disabling the focused button would drop focus to the page. */}
        <button
          type="button"
          className="today-day-button"
          aria-label="Next day"
          aria-disabled={viewed.isToday || undefined}
          onClick={() => {
            if (!viewed.isToday) viewed.next();
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <Link to="/settings" className="today-settings" aria-label="Settings">
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
          </svg>
        </Link>
      </header>
      <p role="status" className="sr-only" data-day-announcer>
        {announcement}
      </p>

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
          <section aria-labelledby="food-journal">
            <h2 id="food-journal" tabIndex={-1}>
              Food journal
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
          day={viewed.date}
          currentDay={viewed.today}
          onSignIn={signOut}
          onSaved={(preview, date, loggedAt) =>
            day.add(asEntry(preview, loggedAt), date)
          }
          renderCard={(preview, sheetDay) => {
            if (loaded.status === "error") {
              return <p className="today-error">{LOAD_FAILED}</p>;
            }
            if (sheetDay !== viewed.date) {
              // The view moved on under the open sheet: the card shows the sheet's own day.
              return (
                <SheetDayCard
                  entries={entries}
                  day={sheetDay}
                  targets={
                    tgt.state.status === "ready" ? tgt.state.targets : null
                  }
                  entry={preview.totals}
                />
              );
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
