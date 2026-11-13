import {
  entryTotals,
  foodLabel,
  formatGrams,
  formatKcalGrouped,
  formatProtein,
  localDate,
} from "@disciplined-sidekick/core";
import { useEffect, useRef, useState } from "react";
import { fullDay } from "../day-label";
import type { CopyHandlers } from "../food/food-log";
import "../food/food.css";
import type { DayEntry, DayItem } from "./entries-store";

/** Identifies a saved item among the day's. */
export const itemKey = (entryId: string, position: number) =>
  `${entryId}:${position}`;

/** Entries newest first, the order the list shows them in. */
export const newestFirst = (entries: DayEntry[]) =>
  entries.toSorted((a, b) => Date.parse(b.loggedAt) - Date.parse(a.loggedAt));

const time = (loggedAt: string | Date) =>
  new Date(loggedAt).toLocaleTimeString([], { timeStyle: "short" });

const DELETE_FAILED = "Couldn't delete";

/** Log now, Delete, its confirmation and its error; mounted only while the row is open, so closing the row cancels a confirmation and clears the status line. */
function ItemPanel({
  entryId,
  item,
  label,
  online,
  logNowBlocked,
  onDelete,
  onLogNow,
}: {
  entryId: string;
  item: DayItem;
  label: string;
  online: boolean;
  logNowBlocked: boolean;
  onDelete: (entryId: string, position: number) => Promise<void>;
  onLogNow: (item: DayItem, handlers: CopyHandlers) => void;
}) {
  // The last copy made from this row: the day it was saved to and when.
  const [logged, setLogged] = useState<{ day: string; at: Date } | null>(null);
  const logNow = useRef<HTMLButtonElement>(null);
  // Set when the sheet closes; focus returns once the button is enabled again.
  const refocusLogNow = useRef(false);
  const [focusTick, setFocusTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusTick re-runs this when the sheet closes
  useEffect(() => {
    if (refocusLogNow.current && !logNowBlocked && online) {
      refocusLogNow.current = false;
      logNow.current?.focus();
    }
  }, [focusTick, logNowBlocked, online]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  // Set when the confirmation closes, so focus returns once Delete is back and enabled.
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
    <div className="food-item-panel">
      <div className="food-item-actions">
        {confirming ? (
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
        ) : (
          <button
            ref={trigger}
            type="button"
            className="food-item-delete"
            aria-label={`Delete ${label}`}
            disabled={!online || busy}
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        )}
        {!confirming && (
          <button
            ref={logNow}
            type="button"
            className="food-item-log-now"
            aria-label={`Log ${label} now`}
            disabled={!online || logNowBlocked}
            onClick={() =>
              onLogNow(item, {
                onSaved: (day, at) => setLogged({ day, at }),
                onClosed: () => {
                  refocusLogNow.current = true;
                  setFocusTick((t) => t + 1);
                },
              })
            }
          >
            Log now
          </button>
        )}
      </div>
      <p role="status" className="food-item-logged">
        {logged &&
          `Logged ${logged.day === localDate(logged.at) ? "today" : fullDay(logged.day)} at ${time(logged.at)}`}
      </p>
      {failed && (
        <p role="alert" className="food-item-error">
          {DELETE_FAILED} {label}. Try again.
        </p>
      )}
    </div>
  );
}

function Item({
  entryId,
  item,
  online,
  leaving,
  open,
  onToggle,
  onClose,
  onDelete,
  logNowBlocked,
  onLogNow,
}: {
  entryId: string;
  item: DayItem;
  online: boolean;
  logNowBlocked: boolean;
  onLogNow: (item: DayItem, handlers: CopyHandlers) => void;
  leaving: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onDelete: (entryId: string, position: number) => Promise<void>;
}) {
  const label = foodLabel(item);

  return (
    <li
      data-item
      className={[
        "food-item",
        open && "food-item-open",
        leaving && "food-item-leaving",
      ]
        .filter(Boolean)
        .join(" ")}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          onClose();
          e.currentTarget
            .querySelector<HTMLElement>("button[aria-expanded]")
            ?.focus();
        }
      }}
    >
      <button
        type="button"
        className="food-item-row button-plain"
        data-row={itemKey(entryId, item.position)}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="food-item-lines">
          <span data-line className="food-item-line">
            <span data-item-name className="food-item-name">
              {label}
            </span>
            <span className="num">{formatKcalGrouped(item.kcal)} kcal</span>
          </span>
          <span data-line className="food-item-line food-item-detail">
            <span data-item-detail className="num">
              {formatGrams(item.grams)} g
              {item.portionEstimated && (
                <>
                  {" "}
                  <span className="mark">est. portion</span>
                </>
              )}
              , {formatProtein(item.protein)} g protein
            </span>
            {item.estimated && (
              <span className="sticker sticker-estimated">Estimated</span>
            )}
            {item.fruitVegG > 0 && (
              <span className="sticker sticker-produce">Fruit/veg</span>
            )}
          </span>
        </span>
        <svg
          className="food-item-chevron"
          data-chevron
          viewBox="0 0 24 24"
          width="24"
          height="24"
          aria-hidden="true"
        >
          <path
            d="m6 9 6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ItemPanel
          entryId={entryId}
          item={item}
          label={label}
          online={online}
          logNowBlocked={logNowBlocked}
          onDelete={onDelete}
          onLogNow={onLogNow}
        />
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
  logNowBlocked,
  onLogNow,
}: {
  entries: DayEntry[];
  online: boolean;
  leaving: ReadonlySet<string>;
  onDelete: (entryId: string, position: number) => Promise<void>;
  /** A lookup is running or a sheet is open. */
  logNowBlocked: boolean;
  onLogNow: (item: DayItem, handlers: CopyHandlers) => void;
}) {
  // One row is open at a time across every entry.
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <>
      {!online && <p className="food-item-offline">You're offline</p>}
      <ul className="entries">
        {newestFirst(entries).map((entry) => {
          const kcal = entryTotals(
            entry.items.filter(
              (i) => !leaving.has(itemKey(entry.id, i.position)),
            ),
          ).kcal;
          return (
            <li key={entry.id} data-entry className="entry">
              <h3 className="entry-title">
                <time className="entry-time" dateTime={entry.loggedAt}>
                  {time(entry.loggedAt)}
                </time>{" "}
                <span className="entry-total num">
                  {formatKcalGrouped(kcal)} kcal
                </span>
              </h3>
              <ul className="food-items">
                {entry.items.map((item) => {
                  const key = itemKey(entry.id, item.position);
                  return (
                    <Item
                      key={item.position}
                      entryId={entry.id}
                      item={item}
                      online={online}
                      leaving={leaving.has(key)}
                      open={openKey === key}
                      onToggle={() =>
                        setOpenKey((k) => (k === key ? null : key))
                      }
                      onClose={() => setOpenKey(null)}
                      onDelete={onDelete}
                      logNowBlocked={logNowBlocked}
                      onLogNow={onLogNow}
                    />
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
}
