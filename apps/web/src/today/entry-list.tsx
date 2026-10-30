import {
  foodLabel,
  formatGrams,
  formatPillarFigure,
  formatProtein,
} from "@disciplined-sidekick/core";
import type { DayEntry, DayItem } from "./entries-store";

function Item({ item }: { item: DayItem }) {
  return (
    <li data-item className="food-item">
      <span className="food-item-name">
        <span data-item-name>{foodLabel(item)}</span>
        {item.estimated && (
          <span className="sticker sticker-estimated">Estimated</span>
        )}
        {item.fruitVegG > 0 && (
          <span className="sticker sticker-produce">
            {formatGrams(item.fruitVegG)} g fruit/veg
          </span>
        )}
      </span>
      <span className="num">
        {formatPillarFigure("calories", item.kcal)} kcal
      </span>
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
    </li>
  );
}

const time = (loggedAt: string) =>
  new Date(loggedAt).toLocaleTimeString([], { timeStyle: "short" });

/** Entries newest first, each with all its items. */
export function EntryList({ entries }: { entries: DayEntry[] }) {
  const newestFirst = [...entries].sort(
    (a, b) => Date.parse(b.loggedAt) - Date.parse(a.loggedAt),
  );
  return (
    <ul className="entries">
      {newestFirst.map((entry) => (
        <li key={entry.id} data-entry className="entry">
          <h3 className="entry-title">
            <time dateTime={entry.loggedAt}>{time(entry.loggedAt)}</time>{" "}
            <span>{entry.text}</span>
          </h3>
          <ul className="food-items">
            {entry.items.map((item, i) => (
              // Saved items are in a fixed order and have no id here.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <Item key={i} item={item} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
