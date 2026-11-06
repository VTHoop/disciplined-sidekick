/** What the app needs to know about a new deploy waiting in the service worker. */
export interface UpdateController {
  /** A new version is downloaded and waiting. */
  available(): boolean;
  /** Calls back when `available()` changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Looks for a new deploy now (on open and on return from the background). */
  check(): void;
  /** Switches to the waiting version and reloads. Only ever called from a tap. */
  reload(): void;
}

/** The slice of `registerSW` from `virtual:pwa-register` this uses. */
type RegisterSW = (options: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onRegisteredSW?: (
    url: string | undefined,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
}) => (reloadPage?: boolean) => Promise<void>;

export function createUpdateController(register: RegisterSW): UpdateController {
  let available = false;
  let registration: ServiceWorkerRegistration | undefined;
  const listeners = new Set<() => void>();

  const applyUpdate = register({
    immediate: true,
    onNeedRefresh: () => {
      available = true;
      for (const listener of listeners) listener();
    },
    onRegisteredSW: (_url, reg) => {
      registration = reg;
    },
  });

  return {
    available: () => available,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // Offline the check fails; the next open or return tries again.
    check: () => {
      registration?.update().catch(() => {});
    },
    reload: () => {
      void applyUpdate(true);
    },
  };
}
