import { localDate } from "@disciplined-sidekick/core";
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
  /** The device's current local calendar day, YYYY-MM-DD. */
  date: string;
  state: DayState;
  retry(): void;
  /** Adds a just-saved entry in place, if it belongs to the day shown. */
  add(entry: DayEntry, entryDate: string): void;
  /** Drops a deleted item from the shown day, and its entry if that was the last item. */
  remove(entryId: string, position: number): void;
}

const MIDNIGHT_SLACK_MS = 50;

function msUntilMidnight(from: Date) {
  const next = new Date(from);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - from.getTime();
}

/**
 * Today's entries for the device's local day. It moves to the new day at local
 * midnight while open, and checks the date whenever the app returns to the
 * foreground.
 */
export function useDay(store: DayEntriesStore): Day {
  const [date, setDate] = useState(() => localDate(new Date()));
  const [state, setState] = useState<DayState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Bumped when a midnight timer fires, so the next one is scheduled even
  // if the date did not change (a timer that fires early).
  const [tick, setTick] = useState(0);
  // The date as of the latest render, so a callback made for an earlier day
  // (Done pressed before midnight) still sees the day it is called on.
  const dateRef = useRef(date);
  dateRef.current = date;
  // Entries saved while their day was still loading: the read may have run
  // before the save, so they are merged into its answer.
  const saved = useRef<{ date: string; entry: DayEntry }[]>([]);

  // attempt only re-runs the load (Retry).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    store.load(date).then(
      (loaded) => {
        if (!active) return;
        const missing = saved.current
          .filter((s) => s.date === date)
          .map((s) => s.entry)
          .filter((entry) => !loaded.some((e) => e.id === entry.id));
        setState({ status: "ready", entries: [...loaded, ...missing] });
      },
      () => active && setState({ status: "error" }),
    );
    return () => {
      active = false;
    };
  }, [store, date, attempt]);

  // tick is read so a fired timer reschedules the next one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick only re-runs the effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDate(localDate(new Date()));
      setTick((n) => n + 1);
    }, msUntilMidnight(new Date()) + MIDNIGHT_SLACK_MS);
    return () => clearTimeout(timer);
  }, [date, tick]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setDate(localDate(new Date()));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const add = useCallback((entry: DayEntry, entryDate: string) => {
    saved.current.push({ date: entryDate, entry });
    if (entryDate !== dateRef.current) return;
    setState((current) =>
      current.status === "ready" &&
      !current.entries.some((e) => e.id === entry.id)
        ? { status: "ready", entries: [...current.entries, entry] }
        : current,
    );
  }, []);

  const remove = useCallback((entryId: string, position: number) => {
    // Keep the merge list in step, so a late load never brings the item back.
    saved.current = saved.current.flatMap((s) => {
      const [entry] = withoutItem([s.entry], entryId, position);
      return entry ? [{ ...s, entry }] : [];
    });
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            entries: withoutItem(current.entries, entryId, position),
          }
        : current,
    );
  }, []);

  return { date, state, retry, add, remove };
}
