import {
  type FoodPreview,
  formatGrams,
  formatKcal,
  formatProtein,
  localDate,
  type PreviewItem,
} from "@disciplined-sidekick/core";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
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

const kcal = (n: number) => `${formatKcal(n)} kcal`;
const protein = (n: number) => `${formatProtein(n)} g protein`;
const fruitVeg = (n: number) => `${formatGrams(n)} g fruit/veg`;

function Item({ item }: { item: PreviewItem }) {
  return (
    <li className="food-item">
      <span className="food-item-name">
        {item.name}
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
        {item.estimated && ". No USDA match, so this is an AI estimate."}
      </span>
    </li>
  );
}

interface SheetProps {
  preview: FoodPreview;
  saving: boolean;
  error: string | null;
  onDone(): void;
  onUndo(): void;
}

/** The preview as a modal bottom sheet. Every way of closing it except Done is Undo. */
function Sheet({ preview, saving, error, onDone, onUndo }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const totalId = useId();
  const drag = useRef<{ id: number; startY: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const undo = useRef(onUndo);
  undo.current = onUndo;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.focus();
    // The back button closes the sheet, as Undo. A pop that lands on another
    // sheet entry (a remount's own history.back()) is not the user leaving.
    history.pushState({ foodSheet: true }, "");
    const onPop = (e: PopStateEvent) => {
      if (!e.state?.foodSheet) undo.current();
    };
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
        <button
          type="button"
          className="action"
          onClick={onDone}
          disabled={saving}
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
}: {
  api: FoodApi;
  now?: () => Date;
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
  const mounted = useRef(true);
  const [refocus, setRefocus] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!refocus) return;
    fieldRef.current?.focus();
    setRefocus(false);
  }, [refocus]);

  const close = useCallback(() => {
    busy.current = false;
    setSaving(false);
    setError(null);
    setPreview(null);
    setRefocus(true);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const entry = text.trim();
    if (!entry || busy.current) return;
    busy.current = true;
    setError(null);
    setParsing(true);
    const result = await api.parse(entry);
    if (!mounted.current) return;
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
    if (!preview || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.save(preview, localDate(now()));
    } catch {
      if (!mounted.current) return;
      setSaving(false);
      setError(SAVE_FAILED);
      return;
    }
    if (!mounted.current) return;
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
