import {
  type ResolvedTargets,
  resolveTargets,
  type StoredTargets,
} from "@disciplined-sidekick/core";
import { useCallback, useEffect, useState } from "react";
import type { SharedTargets } from "./shared-targets";

type TargetsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; targets: ResolvedTargets };

const ready = (stored: StoredTargets | null): TargetsState => ({
  status: "ready",
  targets: resolveTargets(stored),
});

/** The user's resolved targets, kept current when Settings saves one. */
export function useTargets(shared: SharedTargets) {
  const [state, setState] = useState<TargetsState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    shared.load().then(
      (stored) => active && setState(ready(stored)),
      () => active && setState({ status: "error" }),
    );
    const unsubscribe = shared.subscribe(
      (stored) => active && setState(ready(stored)),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [shared]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    shared.reload().then(
      (stored) => setState(ready(stored)),
      () => setState({ status: "error" }),
    );
  }, [shared]);

  return { state, retry };
}
