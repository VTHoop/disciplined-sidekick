import { vi } from "vitest";
import { deferred } from "../food/fake-food";
import {
  type DayEntriesStore,
  type DayEntry,
  type DayItem,
  withoutItem,
} from "./entries-store";

export const sampleItem = (overrides: Partial<DayItem> = {}): DayItem => ({
  position: 0,
  name: "2 eggs",
  canonicalName: "egg, whole, raw",
  grams: 100,
  kcal: 143,
  protein: 12.56,
  fruitVegG: 0,
  estimated: false,
  portionEstimated: false,
  brand: null,
  ...overrides,
});

/** A saved entry; `at` is the local log time (month is 1-based). */
export function sampleEntry(
  overrides: Partial<DayEntry> & {
    at?: [number, number, number, number, number];
  } = {},
): DayEntry {
  const { at = [2026, 10, 30, 12, 30], ...rest } = overrides;
  const [y, mo, d, h, mi] = at;
  return {
    id: `entry-${y}${mo}${d}-${h}${mi}`,
    text: "2 eggs",
    loggedAt: new Date(y, mo - 1, d, h, mi).toISOString(),
    items: [sampleItem()],
    ...rest,
  };
}

/** In-memory stand-in for the day's entries, keyed by local date (YYYY-MM-DD). */
export function createFakeEntries(initial: Record<string, DayEntry[]> = {}) {
  let failure: Error | null = null;
  let deleteFailure: Error | null = null;
  let hold: Promise<void> | null = null;

  return {
    load: vi.fn<DayEntriesStore["load"]>(async (localDate) => {
      if (hold) await hold;
      if (failure) {
        const error = failure;
        failure = null;
        throw error;
      }
      return initial[localDate] ?? [];
    }),
    deleteItem: vi.fn<DayEntriesStore["deleteItem"]>(
      async (entryId, position) => {
        if (deleteFailure) {
          const error = deleteFailure;
          deleteFailure = null;
          throw error;
        }
        for (const [date, list] of Object.entries(initial)) {
          initial[date] = withoutItem(list, entryId, position);
        }
      },
    ),
    failNextDelete: (error = new Error("boom")) => {
      deleteFailure = error;
    },
    failNextLoad: (error = new Error("offline")) => {
      failure = error;
    },
    /** Keeps load pending until the returned function is called. */
    holdLoad() {
      const d = deferred<void>();
      hold = d.promise;
      return () => {
        hold = null;
        d.resolve();
      };
    },
  } satisfies DayEntriesStore & Record<string, unknown>;
}

export type FakeEntries = ReturnType<typeof createFakeEntries>;
