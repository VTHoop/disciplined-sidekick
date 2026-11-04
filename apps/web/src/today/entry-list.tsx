import {
  foodLabel,
  formatGrams,
  formatKcalGrouped,
  formatProtein,
} from "@disciplined-sidekick/core";
import { useEffect, useRef, useState } from "react";
import "../food/food.css";
import type { DayEntry, DayItem } from "./entries-store";

/** Identifies a saved item among the day's. */
export const itemKey = (entryId: string, position: number) =>
  `${entryId}:${position}`;

/** Entries newest first, the order the list shows them in. */
export const newestFirst = (entries: DayEntry[]) =>
  entries.toSorted((a, b) => Date.parse(b.loggedAt) - Date.parse(a.loggedAt));

const time = (loggedAt: string) =>
  new Date(loggedAt).toLocaleTimeString([], { timeStyle: "short" });

const DELETE_FAILED = "Couldn't delete";

function Item({
  entryId,
  item,
  online,
  leaving,
  onDelete,
}: {
  entryId: string;
  item: DayItem;
  online: boolean;
  leaving: boolean;
  onDelete: (entryId: string, position: number) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = foodLabel(item);

  // Set when the confirmation closes, so focus returns once the control is enabled.
  const refocus = useRef(false);
  useEffect(() => {
    if (refocus.current && !confirming && !busy) {
      refocus.current = false;
      trigger.current?.focus();
    }
  }, [confirming, busy]);

  const cancel = () => {
    refocus.current = true;
    setConfirming(false);
  };
  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onDelete(entryId, item.position);
    } catch {
      setFailed(true);
      setBusy(false);
      cancel();
    }
  };

  return (
    <li
      data-item
      className={leaving ? "food-item food-item-leaving" : "food-item"}
    >
      <span className="food-item-name">
        <span data-item-name>{label}</span>
        {item.estimated && (
          <span className="sticker sticker-estimated">Estimated</span>
        )}
        {item.fruitVegG > 0 && (
          <span className="sticker sticker-produce">
            {formatGrams(item.fruitVegG)} g fruit/veg
          </span>
        )}
      </span>
      <span className="num">{formatKcalGrouped(item.kcal)} kcal</span>
      <button
        ref={trigger}
        type="button"
        className="food-item-delete"
        data-delete={itemKey(entryId, item.position)}
        aria-label={`Delete ${label}`}
        disabled={!online || busy}
        onClick={() => setConfirming(true)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M6 7h12M10 7V5h4v2m-6 0 1 12h6l1-12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span data-item-detail className="food-item-detail num">
        {formatGrams(item.grams)} g
        {item.portionEstimated && (
          <>
            {" "}
            <span className="mark">est. portion</span>
          </>
        )}
        , {formatProtein(item.protein)} g protein
      </span>
      {confirming && (
        // biome-ignore lint/a11y/useSemanticElements: a labelled group of two buttons, not a fieldset
        <div
          role="group"
          aria-label={`Confirm delete ${label}`}
          className="food-item-confirm"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              cancel();
            }
          }}
        >
          <button
            type="button"
            className="food-item-delete-yes"
            // biome-ignore lint/a11y/noAutofocus: the confirmation just opened; keyboard users continue from it
            autoFocus
            disabled={!online || busy}
            onClick={confirm}
          >
            Yes, delete
          </button>
          <button type="button" onClick={cancel} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
      {failed && (
        <p role="alert" className="food-item-error">
          {DELETE_FAILED} {label}. Try again.
        </p>
      )}
    </li>
  );
}

/** Entries newest first, each with all its items. */
export function EntryList({
  entries,
  online,
  leaving,
  onDelete,
}: {
  entries: DayEntry[];
  online: boolean;
  leaving: ReadonlySet<string>;
  onDelete: (entryId: string, position: number) => Promise<void>;
}) {
  return (
    <>
      {!online && <p className="food-item-offline">You're offline</p>}
      <ul className="entries">
        {newestFirst(entries).map((entry) => (
          <li key={entry.id} data-entry className="entry">
            <h3 className="entry-title">
              <time dateTime={entry.loggedAt}>{time(entry.loggedAt)}</time>{" "}
              <span>{entry.text}</span>
            </h3>
            <ul className="food-items">
              {entry.items.map((item) => (
                <Item
                  key={item.position}
                  entryId={entry.id}
                  item={item}
                  online={online}
                  leaving={leaving.has(itemKey(entry.id, item.position))}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
