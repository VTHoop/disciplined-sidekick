import type { StoredTargets } from "@disciplined-sidekick/core";
import type { TargetsStore } from "../settings/targets-store";

/**
 * The targets store shared by Settings and Today. It loads once and keeps the
 * result, so a target saved in Settings reaches Today without a refetch.
 */
export interface SharedTargets extends TargetsStore {
  /** Drops the kept result and loads again (Retry). */
  reload(): Promise<StoredTargets | null>;
  /** Called with the stored targets after a save changes them. */
  subscribe(listener: (stored: StoredTargets | null) => void): () => void;
}

const EMPTY: StoredTargets = {
  calories: null,
  protein: null,
  fruitVeg: null,
  fruitVegEdited: false,
};

export function createSharedTargets(store: TargetsStore): SharedTargets {
  let loaded: Promise<StoredTargets | null> | null = null;
  let value: StoredTargets | null | undefined;
  const listeners = new Set<(stored: StoredTargets | null) => void>();

  const load = () => {
    if (!loaded) {
      const attempt = store.load().then(
        (stored) => {
          // A load that a reload or save superseded must not overwrite newer state.
          if (loaded === attempt) value = stored;
          return stored;
        },
        (error) => {
          // A failed load is not kept, so the next call tries again.
          if (loaded === attempt) loaded = null;
          throw error;
        },
      );
      loaded = attempt;
    }
    return loaded;
  };

  return {
    load,
    reload() {
      loaded = null;
      value = undefined;
      return load();
    },
    async save(field, next) {
      await store.save(field, next);
      if (value === undefined) {
        // Never loaded: the other fields are unknown, so load again next time.
        loaded = null;
        return;
      }
      value = {
        ...(value ?? EMPTY),
        [field]: next,
        ...(field === "fruitVeg" ? { fruitVegEdited: true } : {}),
      };
      loaded = Promise.resolve(value);
      for (const listener of listeners) listener(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
