import type { StoredTargets } from "@disciplined-sidekick/core";
import { vi } from "vitest";
import type { TargetsStore } from "./targets-store";

const EMPTY: StoredTargets = {
  calories: null,
  protein: null,
  fruitVeg: null,
  fruitVegEdited: false,
};

/** In-memory stand-in for the targets table that behaves like the real store's contract. */
export function createFakeTargets(initial: StoredTargets | null = null) {
  let stored = initial;
  let saveFailure: Error | null = null;
  let loadFailure: Error | null = null;

  return {
    stored: () => stored,
    failNextSave: (error = new Error("offline")) => {
      saveFailure = error;
    },
    failNextLoad: (error = new Error("offline")) => {
      loadFailure = error;
    },
    load: vi.fn<TargetsStore["load"]>(async () => {
      if (loadFailure) {
        const error = loadFailure;
        loadFailure = null;
        throw error;
      }
      return stored;
    }),
    save: vi.fn<TargetsStore["save"]>(async (field, value) => {
      if (saveFailure) {
        const error = saveFailure;
        saveFailure = null;
        throw error;
      }
      stored = {
        ...(stored ?? EMPTY),
        [field]: value,
        ...(field === "fruitVeg" ? { fruitVegEdited: true } : {}),
      };
    }),
  } satisfies TargetsStore & { stored: unknown };
}

export type FakeTargets = ReturnType<typeof createFakeTargets>;
