import {
  applyGramEdits,
  cleanLines,
  type FoodOrigin,
  type FoodPreview,
  foodLabel,
  formatGrams,
  formatKcalGrouped,
  formatProtein,
  gramsDraft,
  type PreviewItem,
} from "@disciplined-sidekick/core";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { fullDay, shortDay } from "../day-label";
import type { FoodApi } from "./food-api";
import "./food.css";

const NO_FOOD =
  "Couldn't find any food in that. Try e.g. '2 eggs and 150 g blueberries'.";
const LOOKUP_FAILED = "Couldn't log that. Check your connection and try again.";
const SAVE_FAILED = "Couldn't save that. Check your connection and try again.";
const SESSION_EXPIRED = "Your session expired. Sign in again.";

/** How far (px) the sheet must be dragged down to close it. */
const SWIPE_CLOSE_PX = 80;

const kcal = (n: number) => `${formatKcalGrouped(n)} kcal`;
const protein = (n: number) => `${formatProtein(n)} g protein`;
const fruitVeg = (n: number) => `${formatGrams(n)} g fruit/veg`;

/** Why an estimated item has no USDA values. */
function estimateReason(item: PreviewItem) {
  if (item.path === "restaurant") {
    return "Restaurant item, so this is an AI estimate.";
  }
  if (item.path === "branded" && item.brand) {
    return `No ${item.brand} match in USDA, so this is an AI estimate.`;
  }
  return "No USDA match, so this is an AI estimate.";
}

function Item({
  item,
  draft,
  error,
  onDraft,
  onLeave,
}: {
  item: PreviewItem;
  draft: string;
  error: string | null;
  onDraft(value: string): void;
  onLeave(): void;
}) {
  const errorId = useId();
  const label = foodLabel(item);
  const [focused, setFocused] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  // The keypad shrinks the viewport after focus, so scroll again once it has.
  // The cleanup also runs if the sheet closes while the field is focused.
  useEffect(() => {
    const field = fieldRef.current;
    const viewport = window.visualViewport;
    if (!focused || !field) return;
    const show = () => field.scrollIntoView?.({ block: "center" });
    show();
    viewport?.addEventListener("resize", show);
    return () => viewport?.removeEventListener("resize", show);
  }, [focused]);
  return (
    <li className="food-sheet-item">
      <span className="food-sheet-grams-row">
        <input
          data-grams-field
          className="food-item-grams num"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Grams of ${label}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          ref={fieldRef}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onLeave();
          }}
        />
        <span aria-hidden="true">g</span>
      </span>
      <span data-item-name className="food-sheet-item-name">
        <span className="food-sheet-item-label">
          {label}
          {item.estimated && (
            <span data-sticker className="sticker sticker-estimated">
              Estimated
            </span>
          )}
          {item.fruitVegG > 0 && (
            <span data-sticker className="sticker sticker-produce">
              {fruitVeg(item.fruitVegG)}
            </span>
          )}
        </span>
        <span className="food-item-detail num">
          {protein(item.protein)}
          {item.fruitVegG === 0 && `, ${fruitVeg(0)}`}
          {item.portionEstimated && (
            <>
              {" "}
              <span data-sticker className="mark">
                est. portion
              </span>
            </>
          )}
          {item.estimated && `. ${estimateReason(item)}`}
        </span>
      </span>
      <span data-item-kcal className="num">
        {kcal(item.kcal)}
      </span>
      {error && (
        <p id={errorId} role="alert" className="food-item-error">
          {error}
        </p>
      )}
    </li>
  );
}

const isGramsField = (el: EventTarget | null) =>
  el instanceof HTMLElement && el.hasAttribute("data-grams-field");

/** A day as its short date for sight and its full date for assistive tech. */
function DayText({
  prefix,
  day,
  currentDay,
}: {
  prefix: string;
  day: string;
  currentDay: string;
}) {
  return (
    <>
      <span aria-hidden="true">
        {prefix} {shortDay(day, currentDay)}
      </span>
      <span className="sr-only">
        {prefix} {fullDay(day)}
      </span>
    </>
  );
}

interface SheetProps {
  preview: FoodPreview;
  /** The day the entry will be saved to. */
  day: string;
  currentDay: string;
  /** The sheet's day's pillars with this entry added; rendered above the entry total. */
  card?: ReactNode;
  /** One grams field value and its error (or null) per item. */
  drafts: readonly string[];
  draftErrors: readonly (string | null)[];
  saving: boolean;
  error: string | null;
  onDraft(index: number, value: string): void;
  onDone(): void;
  onUndo(): void;
}

/** The preview as a modal bottom sheet. Every way of closing it except Done is Undo. */
function Sheet({
  preview,
  day,
  currentDay,
  card,
  drafts,
  draftErrors,
  saving,
  error,
  onDraft,
  onDone,
  onUndo,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const totalId = useId();
  const drag = useRef<{ id: number; startY: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  // The keypad leaves little room, so the day card steps aside while a grams field has focus.
  const [editingGrams, setEditingGrams] = useState(false);
  // Set when focus leaves a grams field, so a screen reader hears the result once, not per keystroke.
  const [announcement, setAnnouncement] = useState("");
  const onPop = useEffectEvent((e: PopStateEvent) => {
    // A pop that lands on another sheet entry (a remount's own history.back())
    // is not the user leaving.
    if (!e.state?.foodSheet) onUndo();
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.focus();
    // The back button closes the sheet, as Undo.
    history.pushState({ foodSheet: true }, "");
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (history.state?.foodSheet) history.back();
      if (dialog.open) dialog.close();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    onUndo();
  };

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { id: e.pointerId, startY: e.clientY };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    setDragY(Math.max(0, e.clientY - drag.current.startY));
  };
  const onPointerEnd = (e: PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    const dy = e.clientY - drag.current.startY;
    drag.current = null;
    setDragY(0);
    if (e.type === "pointerup" && dy >= SWIPE_CLOSE_PX) onUndo();
  };

  const count = preview.items.length;
  return (
    <dialog
      ref={ref}
      className="food-sheet"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onUndo();
      }}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (isGramsField(e.target)) setEditingGrams(true);
      }}
      onBlur={(e) => {
        // Focus moving to another grams field keeps the card hidden.
        if (isGramsField(e.target) && !isGramsField(e.relatedTarget)) {
          setEditingGrams(false);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="food-sheet-grab">
        <span aria-hidden="true" className="food-sheet-handle" />
        <h2 id={titleId} className="food-sheet-title">
          Check {count} {count === 1 ? "item" : "items"}
        </h2>
        <p className="food-sheet-day">
          <DayText prefix="For" day={day} currentDay={currentDay} />
        </p>
      </div>
      <ul className="food-items">
        {preview.items.map((item, i) => (
          <Item
            // Items have no id of their own until saved; order is stable.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={i}
            item={item}
            draft={drafts[i] ?? gramsDraft(item)}
            error={draftErrors[i] ?? null}
            onDraft={(value) => onDraft(i, value)}
            onLeave={() =>
              // An invalid draft leaves the item as parsed: say nothing, the error alert speaks.
              setAnnouncement(
                draftErrors[i] ? "" : `${foodLabel(item)}: ${kcal(item.kcal)}`,
              )
            }
          />
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {card && (
        // Kept mounted, so it doesn't refetch each time it returns.
        <div className="food-sheet-card" hidden={editingGrams}>
          {card}
        </div>
      )}
      <section className="food-total" aria-labelledby={totalId}>
        <h3 id={totalId}>Entry total</h3>
        <p className="num">
          {kcal(preview.totals.kcal)} · {protein(preview.totals.protein)} ·{" "}
          {fruitVeg(preview.totals.fruitVegG)}
        </p>
      </section>
      <p role="alert">{error}</p>
      <div className="food-sheet-actions">
        <button type="button" onClick={onUndo}>
          Undo
        </button>
        {/* aria-disabled, not disabled: disabling the focused button would drop focus to the page. */}
        <button
          type="button"
          className="action"
          onClick={onDone}
          aria-disabled={saving || draftErrors.some(Boolean)}
        >
          Done
        </button>
      </div>
    </dialog>
  );
}

/** What a copy's sheet tells whoever opened it. */
export interface CopyHandlers {
  /** Done saved the copy to `day` at `loggedAt`. */
  onSaved(day: string, loggedAt: Date): void;
  /** The sheet is gone (saved or undone) and the page is usable again: put focus back. */
  onClosed(): void;
}

/** Opens the sheet from outside the composer. */
export interface FoodLogHandle {
  /** Previews a copy of a saved item for `day`; Done saves it as a new entry, and the composer is left alone. */
  openCopy(preview: FoodPreview, day: string, handlers: CopyHandlers): void;
}

/** Type what you ate, check the preview, then Done saves it. */
export function FoodLog({
  ref,
  onBusyChange,
  api,
  day,
  currentDay,
  now = () => new Date(),
  renderCard,
  onSaved,
  onSignIn,
}: {
  ref?: Ref<FoodLogHandle>;
  /** Called when a lookup starts or ends, or the sheet opens or closes. */
  onBusyChange?: (busy: boolean) => void;
  api: FoodApi;
  /** The day being viewed, YYYY-MM-DD: where an entry is logged. */
  day: string;
  /** The device's current day, which decides whether the field names the day and the year shows. */
  currentDay: string;
  now?: () => Date;
  /** The "just logged" price card for the entry being previewed. */
  renderCard?: (preview: FoodPreview, day: string) => ReactNode;
  /** Called after Done saves, with the day it was saved to and the log time. */
  onSaved?: (preview: FoodPreview, localDate: string, loggedAt: Date) => void;
  /** The Sign in button shown when the session has expired. */
  onSignIn: () => void;
}) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  // The preview with the day it was made for: Done saves there, wherever the view has moved since.
  const [sheet, setSheet] = useState<{
    preview: FoodPreview;
    day: string;
    origin: FoodOrigin;
  } | null>(null);
  // Set while a copy's sheet is open: who to tell when it saves and closes.
  const copyHandlers = useRef<CopyHandlers | null>(null);
  const preview = sheet?.preview ?? null;
  // The grams fields' text per item, kept here so a failed save keeps the edits.
  const [drafts, setDrafts] = useState<string[]>([]);
  const edited = sheet ? applyGramEdits(sheet.preview, drafts) : null;
  const placeholderId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  // Guards that act before React re-renders, so a double submit or Done can't slip through.
  const busy = useRef(false);
  const savingRef = useRef(false);
  const [refocus, setRefocus] = useState(false);
  // What the Log button and Ctrl/Cmd+Enter both check.
  const hasFood = cleanLines(text) !== "";
  const canLog = !parsing && preview === null && hasFood;

  useEffect(() => {
    if (!refocus) return;
    setRefocus(false);
    // After a copy's sheet, focus goes back to the button that opened it, not the composer.
    const handlers = copyHandlers.current;
    copyHandlers.current = null;
    if (handlers) handlers.onClosed();
    else fieldRef.current?.focus();
  }, [refocus]);

  const isBusy = parsing || sheet !== null;
  const reportBusy = useEffectEvent(() => onBusyChange?.(isBusy));
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when busy changes
  useEffect(() => reportBusy(), [isBusy]);

  useImperativeHandle(ref, () => ({
    openCopy(copy, copyDay, handlers) {
      if (busy.current || savingRef.current || sheet) return;
      copyHandlers.current = handlers;
      setDrafts(copy.items.map(gramsDraft));
      setSheet({ preview: copy, day: copyDay, origin: "reused" });
    },
  }));

  const close = () => {
    busy.current = false;
    savingRef.current = false;
    setSaving(false);
    setError(null);
    setSessionExpired(false);
    setSheet(null);
    setDrafts([]);
    setRefocus(true);
  };

  /** The sign-in is gone: drop the preview and ask for a new one. */
  const expireSession = () => {
    busy.current = false;
    savingRef.current = false;
    setSaving(false);
    setSheet(null);
    setDrafts([]);
    copyHandlers.current = null;
    setError(SESSION_EXPIRED);
    setSessionExpired(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasFood || busy.current) return;
    busy.current = true;
    setError(null);
    setSessionExpired(false);
    setParsing(true);
    // The day is fixed when the entry is submitted.
    const viewedDay = day;
    // Sent as typed: the server checks the 2000 character limit on it, then trims each line.
    const result = await api.parse(text);
    setParsing(false);
    if (result.ok) {
      setDrafts(result.preview.items.map(gramsDraft));
      setSheet({ preview: result.preview, day: viewedDay, origin: "parsed" });
      return;
    }
    if (result.reason === "session") {
      expireSession();
      return;
    }
    busy.current = false;
    setError(result.reason === "no_food" ? NO_FOOD : LOOKUP_FAILED);
    setRefocus(true);
  };

  const onDone = async () => {
    if (!sheet || !edited || savingRef.current) return;
    if (edited.errors.some(Boolean)) return;
    const { day: sheetDay, origin } = sheet;
    const { preview } = edited;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const loggedAt = now();
    const result =
      origin === "reused"
        ? await api.save(preview, sheetDay, origin)
        : await api.save(preview, sheetDay);
    if (!result.ok) {
      if (result.reason === "session") {
        expireSession();
        return;
      }
      savingRef.current = false;
      setSaving(false);
      setError(SAVE_FAILED);
      return;
    }
    onSaved?.(preview, sheetDay, loggedAt);
    copyHandlers.current?.onSaved(sheetDay, loggedAt);
    // A copy is not what the composer holds.
    if (origin === "parsed") setText("");
    close();
  };

  return (
    <section className="food-log">
      <form
        aria-label="Log food"
        aria-busy={parsing}
        onSubmit={onSubmit}
        className="food-log-form"
      >
        <label htmlFor={fieldId} className="sr-only">
          What did you eat?
        </label>
        <div className="food-log-row">
          <textarea
            id={fieldId}
            ref={fieldRef}
            rows={1}
            enterKeyHint="enter"
            autoComplete="off"
            value={text}
            placeholder="What did you eat?"
            aria-describedby={day === currentDay ? undefined : placeholderId}
            disabled={parsing}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
              e.preventDefault();
              if (!canLog) return;
              e.currentTarget.form?.requestSubmit();
            }}
          />
          <button type="submit" disabled={!canLog}>
            Log
          </button>
        </div>
      </form>
      {day !== currentDay && (
        <span id={placeholderId} className="sr-only">
          Add to {fullDay(day)}
        </span>
      )}
      <p role="status" className="food-log-status">
        {parsing ? "Looking up…" : ""}
      </p>
      {sheet && edited ? (
        <Sheet
          preview={edited.preview}
          day={sheet.day}
          currentDay={currentDay}
          card={renderCard?.(edited.preview, sheet.day)}
          drafts={drafts}
          draftErrors={edited.errors}
          saving={saving}
          error={error}
          onDraft={(i, value) =>
            setDrafts((d) => d.map((v, j) => (j === i ? value : v)))
          }
          onDone={onDone}
          onUndo={close}
        />
      ) : (
        <>
          <p role="alert">{error}</p>
          {sessionExpired && (
            <button type="button" onClick={onSignIn}>
              Sign in
            </button>
          )}
        </>
      )}
    </section>
  );
}
