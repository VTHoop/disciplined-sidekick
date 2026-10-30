import {
  entryTotals,
  type FoodPreview,
  type ResolvedTargets,
} from "@disciplined-sidekick/core";
import { Link } from "react-router";
import type { FoodApi } from "../food/food-api";
import { FoodLog } from "../food/food-log";
import type { DayEntriesStore, DayEntry } from "./entries-store";
import { EntryList } from "./entry-list";
import { PriceCard } from "./price-card";
import type { SharedTargets } from "./shared-targets";
import { useDay } from "./use-day";
import { useTargets } from "./use-targets";
import "./today.css";

export const LOAD_FAILED = "Couldn't load today's totals.";
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

const asEntry = (preview: FoodPreview, loggedAt: Date): DayEntry => ({
  id: preview.entryId,
  text: preview.text,
  loggedAt: loggedAt.toISOString(),
  items: preview.items.map((i) => ({
    name: i.name,
    canonicalName: i.canonicalName,
    grams: i.grams,
    kcal: i.kcal,
    protein: i.protein,
    fruitVegG: i.fruitVegG,
    estimated: i.estimated,
    portionEstimated: i.portionEstimated,
    brand: i.brand,
  })),
});

type Loaded =
  | { status: "loading" | "error" }
  | { status: "ready"; entries: DayEntry[]; targets: ResolvedTargets };

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

  const loaded: Loaded =
    day.state.status === "error" || tgt.state.status === "error"
      ? { status: "error" }
      : day.state.status === "ready" && tgt.state.status === "ready"
        ? {
            status: "ready",
            entries: day.state.entries,
            targets: tgt.state.targets,
          }
        : { status: "loading" };

  const dayTotals =
    loaded.status === "ready" &&
    entryTotals(loaded.entries.flatMap((e) => e.items));

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
      {loaded.status === "ready" && dayTotals && (
        <>
          <PriceCard totals={dayTotals} targets={loaded.targets} />
          <section aria-labelledby="logged-today">
            <h2 id="logged-today">Logged today</h2>
            {loaded.entries.length === 0 ? (
              <p>{NOTHING_LOGGED}</p>
            ) : (
              <EntryList entries={loaded.entries} />
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
            if (loaded.status === "loading" || !dayTotals) {
              return <p role="status">{LOADING}</p>;
            }
            return (
              <PriceCard
                totals={dayTotals}
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
