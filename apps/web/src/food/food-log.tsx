import {
  type FoodPreview,
  foodLabel,
  formatGrams,
  formatPillarFigure,
  formatProtein,
  localDate,
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
import type { FoodApi } from "./food-api";
import "./food.css";

const NO_FOOD =
  "Couldn't find any food in that. Try e.g. '2 eggs and 150 g blueberries'.";
const LOOKUP_FAILED = "Couldn't log that. Check your connection and try again.";
const SAVE_FAILED = "Couldn't save that. Check your connection and try again.";

/** How far (px) the sheet must be dragged down to close it. */
const SWIPE_CLOSE_PX = 80;

const kcal = (n: number) => `${formatPillarFigure("calories", n)} kcal`;
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

function Item({ item }: { item: PreviewItem }) {
  return (
    <li className="food-item">
      <span className="food-item-name">
        {foodLabel(item)}
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
      <span className="food-item-detail num">
        {formatGrams(item.grams)} g
        {item.portionEstimated && (
          <>
            {" "}
            <span data-sticker className="mark">
              est. portion
            </span>
          </>
        )}
        , {protein(item.protein)}
        {item.fruitVegG === 0 && `, ${fruitVeg(0)}`}
        {item.estimated && `. ${estimateReason(item)}`}
      </span>
    </li>
  );
}

interface SheetProps {
  preview: FoodPreview;
  /** Today's pillars with this entry added; rendered above the entry total. */
  card?: ReactNode;
  saving: boolean;
  error: string | null;
  onDone(): void;
  onUndo(): void;
}

/** The preview as a modal bottom sheet. Every way of closing it except Done is Undo. */
function Sheet({ preview, card, saving, error, onDone, onUndo }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const totalId = useId();
  const drag = useRef<{ id: number; startY: number } | null>(null);
  const [dragY, setDragY] = useState(0);
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
        <p className="food-sheet-text">{preview.text}</p>
      </div>
      <ul className="food-items">
        {preview.items.map((item, i) => (
          // Items have no id of their own until saved; order is stable.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <Item key={i} item={item} />
        ))}
      </ul>
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
          aria-disabled={saving}
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
  now = () => new Date(),
  renderCard,
  onSaved,
}: {
  api: FoodApi;
  now?: () => Date;
  /** The "just logged" price card for the entry being previewed. */
  renderCard?: (preview: FoodPreview) => ReactNode;
  /** Called after Done saves, with the saved entry's local day and log time. */
  onSaved?: (preview: FoodPreview, localDate: string, loggedAt: Date) => void;
}) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<FoodPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  // Guards that act before React re-renders, so a double submit or Done can't slip through.
  const busy = useRef(false);
  const savingRef = useRef(false);
  const [refocus, setRefocus] = useState(false);

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
    setPreview(null);
    setRefocus(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const entry = text.trim();
    if (!entry || busy.current) return;
    busy.current = true;
    setError(null);
    setParsing(true);
    const result = await api.parse(entry);
    setParsing(false);
    if (result.ok) {
      setPreview(result.preview);
      return;
    }
    busy.current = false;
    setError(result.reason === "no_food" ? NO_FOOD : LOOKUP_FAILED);
    setRefocus(true);
  };

  const onDone = async () => {
    if (!preview || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const loggedAt = now();
    const day = localDate(loggedAt);
    try {
      await api.save(preview, day);
    } catch {
      savingRef.current = false;
      setSaving(false);
      setError(SAVE_FAILED);
      return;
    }
    onSaved?.(preview, day, loggedAt);
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
          <input
            id={fieldId}
            ref={fieldRef}
            type="text"
            autoComplete="off"
            value={text}
            disabled={parsing}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="submit"
            disabled={parsing || preview !== null || text.trim() === ""}
          >
            Log
          </button>
        </div>
      </form>
      <p role="status" className="food-log-status">
        {parsing ? "Looking up…" : ""}
      </p>
      {preview ? (
        <Sheet
          preview={preview}
          card={renderCard?.(preview)}
          saving={saving}
          error={error}
          onDone={onDone}
          onUndo={close}
        />
      ) : (
        <p role="alert">{error}</p>
      )}
    </section>
  );
}
