import { useEffect, useSyncExternalStore } from "react";
import type { UpdateController } from "./update-controller";
import "./update-notice.css";

/**
 * "New version available · Reload" above every signed-in screen. It looks for a
 * new deploy when it mounts (the app opened) and when the app returns to the
 * foreground, and never reloads on its own. The status region is always in the
 * page and only its text changes, so a screen reader announces the line once.
 */
export function UpdateNotice({ updates }: { updates: UpdateController }) {
  const available = useSyncExternalStore(
    updates.subscribe,
    updates.available,
    () => false,
  );

  useEffect(() => {
    updates.check();
    const onVisible = () => {
      if (document.visibilityState === "visible") updates.check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [updates]);

  return (
    <div className="update-notice" hidden={!available}>
      <p role="status">{available ? "New version available" : ""}</p>
      {available && (
        <button type="button" onClick={updates.reload}>
          Reload
        </button>
      )}
    </div>
  );
}
