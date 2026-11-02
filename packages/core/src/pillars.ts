import { formatGrams, formatKcalGrouped } from "./nutrition.js";

export type PillarKind = "calories" | "protein" | "fruitVeg";

export const PILLAR_LABEL: Record<PillarKind, string> = {
  calories: "Calories",
  protein: "Protein",
  fruitVeg: "Fruit & veg",
};

export interface PillarState {
  kind: PillarKind;
  /** The true, unrounded total. */
  total: number;
  target: number | null;
  /** Consumed ÷ target, stopping at the full bar; null without a target. */
  fill: number | null;
  /** Whole kcal over the calorie limit, as displayed; 0 for the other pillars. */
  over: number;
  /** Protein or fruit/veg at or above its goal, as displayed. */
  reached: boolean;
}

const unit = (kind: PillarKind) => (kind === "calories" ? "kcal" : "g");

/** The amount as the figure displays it: whole kcal and grams. */
const displayed = (n: number) => Math.round(n);

/** A figure rounded as displayed: whole numbers, with thousands separators on kcal. */
export function formatPillarFigure(kind: PillarKind, n: number): string {
  return kind === "calories" ? formatKcalGrouped(n) : formatGrams(n);
}

/** "limit 2,200 kcal" for calories, "goal 140 g" for protein and fruit & veg. */
export function pillarTargetLabel(kind: PillarKind, target: number): string {
  const word = kind === "calories" ? "limit" : "goal";
  return `${word} ${target.toLocaleString("en-US")} ${unit(kind)}`;
}

/**
 * Fill, over and reached for one pillar. Over and reached compare the figures
 * as they display, so a total that shows "2,200" is never "0 over" and one that
 * shows "140.0" against a goal of 140 has reached it.
 */
export function pillarState(
  kind: PillarKind,
  total: number,
  target: number | null,
): PillarState {
  if (target === null) {
    return { kind, total, target, fill: null, over: 0, reached: false };
  }
  const shown = displayed(total);
  return {
    kind,
    total,
    target,
    fill: Math.min(total / target, 1),
    over: kind === "calories" ? Math.max(0, shown - target) : 0,
    reached: kind !== "calories" && shown >= target,
  };
}

/** One sentence for assistive tech; `added` is what a previewed entry adds. */
export function pillarSentence(
  state: PillarState,
  { added = 0 }: { added?: number } = {},
): string {
  const { kind, total, target, over, reached } = state;
  const parts = [
    `${PILLAR_LABEL[kind]}: ${formatPillarFigure(kind, total)} ${unit(kind)}`,
  ];
  parts.push(
    target === null ? "no target set" : pillarTargetLabel(kind, target),
  );
  if (over > 0) parts.push(`${formatPillarFigure(kind, over)} over`);
  if (reached) parts.push("reached");
  if (added > 0) {
    parts.push(
      `this entry adds ${formatPillarFigure(kind, added)} ${unit(kind)}`,
    );
  }
  return `${parts.join(", ")}.`;
}

export interface PreviewPillar {
  after: PillarState;
  /** What the entry adds, rounded as the figure displays; 0 means nothing to show. */
  added: number;
  /** The entry's share of the bar, as fractions of the full bar; null when there is none to draw. */
  hatch: { from: number; to: number } | null;
  /** Text for the share, or null when the entry adds nothing. */
  shareText: string | null;
}

/** A pillar's day total with a previewed, unsaved entry added. */
export function previewPillar(
  kind: PillarKind,
  dayTotal: number,
  entryAmount: number,
  target: number | null,
): PreviewPillar {
  const before = pillarState(kind, dayTotal, target);
  const after = pillarState(kind, dayTotal + entryAmount, target);
  const added = displayed(entryAmount);
  if (added === 0) {
    return { after, added, hatch: null, shareText: null };
  }
  const amount = formatPillarFigure(kind, added);
  // A pillar already at or past its line has no room left to hatch.
  const hasRoom =
    target !== null &&
    before.fill !== null &&
    before.fill < 1 &&
    !(kind === "calories" ? before.over > 0 : before.reached);
  if (hasRoom && before.fill !== null && after.fill !== null) {
    return {
      after,
      added,
      hatch: { from: before.fill, to: after.fill },
      shareText: `+${amount}, ${pillarTargetLabel(kind, target)}`,
    };
  }
  return {
    after,
    added,
    hatch: null,
    shareText: `+${amount} ${unit(kind)} from this entry`,
  };
}
