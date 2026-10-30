import type { ResolvedTargets, Totals } from "@disciplined-sidekick/core";
import { PillarRow } from "./pillar-row";

/** The three pillars. `entry` is the unsaved entry on the "just logged" sheet. */
export function PriceCard({
  totals,
  targets,
  entry,
}: {
  totals: Totals;
  targets: ResolvedTargets;
  entry?: Totals;
}) {
  return (
    <div data-price-card className="price-card">
      <ul className="pillars">
        <PillarRow
          kind="calories"
          total={totals.kcal}
          target={targets.calories}
          entry={entry?.kcal}
        />
        <PillarRow
          kind="protein"
          total={totals.protein}
          target={targets.protein}
          entry={entry?.protein}
        />
        <PillarRow
          kind="fruitVeg"
          total={totals.fruitVegG}
          target={targets.fruitVeg}
          entry={entry?.fruitVegG}
        />
      </ul>
    </div>
  );
}
