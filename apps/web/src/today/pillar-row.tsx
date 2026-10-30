import {
  formatPillarFigure,
  PILLAR_LABEL,
  type PillarKind,
  pillarSentence,
  pillarTargetLabel,
  previewPillar,
} from "@disciplined-sidekick/core";
import { Link } from "react-router";

const TRACK: Record<PillarKind, string> = {
  calories: "energy",
  protein: "protein",
  fruitVeg: "produce",
};

const percent = (fraction: number) => `${fraction * 100}%`;

interface Props {
  kind: PillarKind;
  /** The day's total so far. */
  total: number;
  target: number | null;
  /** The unsaved entry's amount, on the "just logged" sheet. */
  entry?: number;
}

/**
 * One pillar: a single sentence for assistive tech, and a visual (name, figure,
 * stickers, sub-label, bar) hidden from it so nothing is announced twice.
 */
export function PillarRow({ kind, total, target, entry }: Props) {
  const previewing = entry !== undefined;
  const p = previewPillar(kind, total, previewing ? entry : 0, target);
  const { after, hatch, shareText } = p;
  const solid = hatch ? hatch.from : after.fill;
  return (
    <li data-pillar={kind} className={`pillar pillar-${TRACK[kind]}`}>
      <p className="sr-only">
        {pillarSentence(after, { added: previewing ? p.added : 0 })}
      </p>
      <span aria-hidden="true" className="pillar-name">
        {PILLAR_LABEL[kind]}
      </span>
      <span aria-hidden="true" data-figure className="pillar-figure num">
        {formatPillarFigure(kind, after.total)}
      </span>
      <span aria-hidden="true" className="pillar-stickers">
        {after.over > 0 && (
          <span className="sticker sticker-over">
            {formatPillarFigure(kind, after.over)} over
          </span>
        )}
        {after.reached && (
          <span className="sticker sticker-reached">Reached</span>
        )}
      </span>
      {target !== null && !(previewing && hatch) && (
        <span aria-hidden="true" data-sublabel className="pillar-sublabel">
          {pillarTargetLabel(kind, target)}
        </span>
      )}
      {target === null && !previewing && (
        <Link to="/settings" className="pillar-set-target">
          Set a target
        </Link>
      )}
      {previewing && shareText && (
        <span aria-hidden="true" data-share className="pillar-share num">
          {shareText}
        </span>
      )}
      <div aria-hidden="true" data-bar className="pillar-bar">
        {solid !== null && (
          <div
            data-fill
            className="pillar-fill"
            style={{ width: percent(solid) }}
          >
            <span data-level className="pillar-level" />
          </div>
        )}
        {hatch && (
          <div
            data-hatch
            className="pillar-hatch"
            style={{
              left: percent(hatch.from),
              width: percent(hatch.to - hatch.from),
            }}
          />
        )}
      </div>
    </li>
  );
}
