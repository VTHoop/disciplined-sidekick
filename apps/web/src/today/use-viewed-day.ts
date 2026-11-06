import { localDate } from "@disciplined-sidekick/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { shiftDay } from "../day-label";

/** Away from a past day this long or longer, the app comes back on the current day. */
export const AWAY_MS = 5 * 60_000;
const MIDNIGHT_SLACK_MS = 50;

export interface ViewedDay {
  /** The day being viewed, YYYY-MM-DD. */
  date: string;
  /** The device's current local day. */
  today: string;
  isToday: boolean;
  previous(): void;
  next(): void;
  backToToday(): void;
}

function msUntilMidnight(from: Date) {
  const next = new Date(from);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - from.getTime();
}

/**
 * The day Today shows. It lives above the routes, so Settings and back keeps
 * it, and a cold start begins on the current day. On the current day it
 * follows local midnight and the foreground; a past day stays put through
 * midnight and goes back to the current day after 5 minutes away.
 */
export function useViewedDay(): ViewedDay {
  const [today, setToday] = useState(() => localDate(new Date()));
  // A past day picked with the arrows; null follows the current day.
  const [picked, setPicked] = useState<string | null>(null);
  // Bumped when a midnight timer fires, so the next one is scheduled even
  // if the date did not change (a timer that fires early).
  const [tick, setTick] = useState(0);
  const hiddenAt = useRef<number | null>(null);

  const date = picked !== null && picked < today ? picked : today;
  const dateRef = useRef(date);
  dateRef.current = date;
  const todayRef = useRef(today);
  todayRef.current = today;

  // tick is read so a fired timer reschedules the next one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick only re-runs the effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setToday(localDate(new Date()));
      setTick((n) => n + 1);
    }, msUntilMidnight(new Date()) + MIDNIGHT_SLACK_MS);
    return () => clearTimeout(timer);
  }, [today, tick]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const now = Date.now();
      setToday(localDate(new Date(now)));
      if (hiddenAt.current !== null && now - hiddenAt.current >= AWAY_MS) {
        setPicked(null);
      }
      hiddenAt.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const previous = useCallback(
    () => setPicked(shiftDay(dateRef.current, -1)),
    [],
  );
  const next = useCallback(() => {
    const day = shiftDay(dateRef.current, 1);
    setPicked(day < todayRef.current ? day : null);
  }, []);
  const backToToday = useCallback(() => setPicked(null), []);

  return {
    date,
    today,
    isToday: date === today,
    previous,
    next,
    backToToday,
  };
}
