import {
  applyGramEdits,
  cleanLines,
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
  useEffect,
  useEffectEvent,
  useId,
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
    <li className="food-item">
      <span className="food-item-name">
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
      <span className="num">{kcal(item.kcal)}</span>
      <span className="food-item-grams-row">
        <input
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
        {item.portionEstimated && (
          <span data-sticker className="mark">
            est. portion
          </span>
        )}
      </span>
      {error && (
        <p id={errorId} role="alert" className="food-item-error">
          {error}
        </p>
      )}
      <span className="food-item-detail num">
        {protein(item.protein)}
        {item.fruitVegG === 0 && `, ${fruitVeg(0)}`}
        {item.estimated && `. ${estimateReason(item)}`}
      </span>
    </li>
  );
}

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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="food-sheet-grab">
        <span aria-hidden="true" className="food-sheet-handle" />
        <h2 id={titleId} className="food-sheet-title">
          Logged {count} {count === 1 ? "item" : "items"}
        </h2>
        <p className="food-sheet-day">
          <DayText prefix="For" day={day} currentDay={currentDay} />
        </p>
        <p className="food-sheet-text">{preview.text}</p>
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
      {card}
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

/** Type what you ate, check the preview, then Done saves it. */
export function FoodLog({
  api,
  day,
  currentDay,
  now = () => new Date(),
  renderCard,
  onSaved,
  onSignIn,
}: {
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
  } | null>(null);
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
  const canLog = !parsing && preview === null && text.trim() !== "";

  useEffect(() => {
    if (!refocus) return;
    fieldRef.current?.focus();
    setRefocus(false);
  }, [refocus]);

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
    setError(SESSION_EXPIRED);
    setSessionExpired(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const entry = cleanLines(text);
    if (!entry || busy.current) return;
    busy.current = true;
    setError(null);
    setSessionExpired(false);
    setParsing(true);
    // The day is fixed when the entry is submitted.
    const viewedDay = day;
    const result = await api.parse(entry);
    setParsing(false);
    if (result.ok) {
      setDrafts(result.preview.items.map(gramsDraft));
      setSheet({ preview: result.preview, day: viewedDay });
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
    const { day: sheetDay } = sheet;
    const { preview } = edited;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const loggedAt = now();
    const result = await api.save(preview, sheetDay);
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
    setText("");
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
        <label htmlFor={fieldId}>What did you eat?</label>
        <div className="food-log-row">
          <textarea
            id={fieldId}
            ref={fieldRef}
            rows={1}
            enterKeyHint="enter"
            autoComplete="off"
            value={text}
            placeholder={
              day === currentDay
                ? undefined
                : `Add to ${shortDay(day, currentDay)}`
            }
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
