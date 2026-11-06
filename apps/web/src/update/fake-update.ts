import { vi } from "vitest";
import type { UpdateController } from "./update-controller";

/** In-memory stand-in for the service-worker update controller. */
export function createFakeUpdates() {
  let available = false;
  const listeners = new Set<() => void>();
  return {
    /** A new deploy has been downloaded and is waiting. */
    publish: () => {
      available = true;
      for (const listener of listeners) listener();
    },
    available: () => available,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    check: vi.fn<UpdateController["check"]>(),
    reload: vi.fn<UpdateController["reload"]>(),
  } satisfies UpdateController & { publish: unknown };
}

export type FakeUpdates = ReturnType<typeof createFakeUpdates>;
