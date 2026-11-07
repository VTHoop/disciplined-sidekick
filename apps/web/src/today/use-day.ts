import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DayEntriesStore,
  type DayEntry,
  withoutItem,
} from "./entries-store";

type DayState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: DayEntry[] };

interface Day {
  state: DayState;
  retry(): void;
  /** Adds a just-saved entry in place, if it belongs to the day loaded. */
  add(entry: DayEntry, entryDate: string): void;
  /** Drops a deleted item from the shown day, and its entry if that was the last item. */
  remove(entryId: string, position: number): void;
}

/**
 * The entries of one day. The state is tagged with its day, so a day that is
 * no longer asked for is never returned: until the asked-for day has loaded,
 * the state is loading.
 */
export function useDay(store: DayEntriesStore, date: string): Day {
  const [answer, setAnswer] = useState<{
    date: string;
    state: Exclude<DayState, { status: "loading" }>;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Entries saved while their day was still loading: the read may have run
  // before the save, so they are merged into its answer.
  const saved = useRef<{ date: string; entry: DayEntry }[]>([]);
  const state: DayState =
    answer?.date === date ? answer.state : { status: "loading" };

  // attempt only re-runs the load (Retry).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    let active = true;
    setAnswer(null);
    store.load(date).then(
      (loaded) => {
        if (!active) return;
        const missing = saved.current
          .filter((s) => s.date === date)
          .map((s) => s.entry)
          .filter((entry) => !loaded.some((e) => e.id === entry.id));
        setAnswer({
          date,
          state: { status: "ready", entries: [...loaded, ...missing] },
        });
      },
      () => active && setAnswer({ date, state: { status: "error" } }),
    );
    return () => {
      active = false;
    };
  }, [store, date, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const add = useCallback((entry: DayEntry, entryDate: string) => {
    saved.current.push({ date: entryDate, entry });
    setAnswer((current) =>
      current?.date === entryDate &&
      current.state.status === "ready" &&
      !current.state.entries.some((e) => e.id === entry.id)
        ? {
            date: entryDate,
            state: {
              status: "ready",
              entries: [...current.state.entries, entry],
            },
          }
        : current,
    );
  }, []);

  const remove = useCallback((entryId: string, position: number) => {
    // Keep the merge list in step, so a late load never brings the item back.
    saved.current = saved.current.flatMap((s) => {
      const [entry] = withoutItem([s.entry], entryId, position);
      return entry ? [{ ...s, entry }] : [];
    });
    setAnswer((current) =>
      current?.state.status === "ready"
        ? {
            date: current.date,
            state: {
              status: "ready",
              entries: withoutItem(current.state.entries, entryId, position),
            },
          }
        : current,
    );
  }, []);

  return { state, retry, add, remove };
}
