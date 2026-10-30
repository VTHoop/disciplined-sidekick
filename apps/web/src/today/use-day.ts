import { localDate } from "@disciplined-sidekick/core";
import { useCallback, useEffect, useState } from "react";
import type { DayEntriesStore, DayEntry } from "./entries-store";

export type DayState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: DayEntry[] };

export interface Day {
  /** The device's current local calendar day, YYYY-MM-DD. */
  date: string;
  state: DayState;
  retry(): void;
  /** Adds a just-saved entry in place, if it belongs to the day shown. */
  add(entry: DayEntry, entryDate: string): void;
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

  // attempt only re-runs the load (Retry).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    store.load(date).then(
      (entries) => active && setState({ status: "ready", entries }),
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
  const add = useCallback(
    (entry: DayEntry, entryDate: string) => {
      if (entryDate !== date) return;
      setState((current) =>
        current.status === "ready"
          ? { status: "ready", entries: [...current.entries, entry] }
          : current,
      );
    },
    [date],
  );

  return { date, state, retry, add };
}
