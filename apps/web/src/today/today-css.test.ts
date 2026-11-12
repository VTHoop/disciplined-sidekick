import { describe, expect, it } from "vitest";
import { declsFor, px, readWeb, stripComments } from "../styles/css-test-utils";

const css = () => stripComments(readWeb("src/today/today.css"));

const bodyOf = (selector: RegExp) =>
  [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => selector.test((m[1] ?? "").trim()))
    .map((m) => m[2] ?? "")
    .join(";");

/** The body of the rule whose selector list names exactly this selector. */
const bodyOfExact = (selector: string) =>
  [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) =>
      (m[1] ?? "")
        .split(",")
        .map((s) => s.trim())
        .includes(selector),
    )
    .map((m) => m[2] ?? "")
    .join(";");

describe("today.css", () => {
  it("is loaded by the Today screen", () => {
    expect(readWeb("src/today/today.tsx")).toMatch(
      /import\s+["']\.\/today\.css["']/,
    );
  });

  it("pins the composer to the bottom on the ground colour", () => {
    const rule = [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) =>
      /composer/.test(m[1] ?? ""),
    );
    expect(rule, "a .today-composer rule").toBeDefined();
    const body = rule?.[2] ?? "";
    expect(body).toMatch(/position:\s*(sticky|fixed)/);
    expect(body).toMatch(/bottom:\s*0/);
    expect(body).toMatch(/background:\s*var\(--color-surface-ground\)/);
  });

  it("styles the over and reached stickers with their tokens", () => {
    expect(css()).toMatch(/var\(--color-sticker-over\)/);
    expect(css()).toMatch(/var\(--color-sticker-reached\)/);
  });

  it("draws the entry's share as a repeating pattern", () => {
    expect(css()).toMatch(
      /\.pillar-hatch[^{}]*\{[^}]*(repeating-linear-gradient)/,
    );
  });

  it("sets the whole pillar row, sub-label and stickers in tabular numerals", () => {
    expect(bodyOf(/^\.pillar$/)).toMatch(
      /font-variant-numeric:\s*tabular-nums/,
    );
  });

  it("keeps the hatch in a band under the text, since stripes behind it fall below 4.5:1", () => {
    const hatch = bodyOf(/^\.pillar-hatch$/);
    expect(hatch).toMatch(/height:/);
    expect(hatch).not.toMatch(/inset-block/);
    expect(hatch).toMatch(/bottom:\s*0/);
  });
});

describe("today.css compact pillar band", () => {
  const pillar = () => declsFor(css(), ".pillar");

  it("is 56 px tall, border-box, with the hatch band still at its bottom edge", () => {
    expect(pillar().height).toBe("56px");
    expect(pillar()["box-sizing"]).toBe("border-box");
    expect(px(declsFor(css(), ".pillar-hatch").height)).toBeGreaterThan(0);
  });

  it("puts the name and its sticker on row 1, the sub-label under them and the figure at the right", () => {
    expect(declsFor(css(), ".pillar-name")["grid-row"]).toBe("1");
    expect(declsFor(css(), ".pillar-stickers")["grid-row"]).toBe("1");
    expect(declsFor(css(), ".pillar-sublabel")["grid-row"]).toBe("2");
    const figure = declsFor(css(), ".pillar-figure");
    expect(figure["grid-column"]).toBe("3");
    expect(figure["grid-row"]).toBe("1 / span 2");
  });

  it("fits a five-digit figure at 375 px: no wrapping, a shrinkable text column, at most 2 rem", () => {
    const figure = declsFor(css(), ".pillar-figure");
    expect(figure["white-space"]).toBe("nowrap");
    expect(px(figure["font-size"])).toBeLessThanOrEqual(32);
    expect(declsFor(css(), ".pillar-name")["min-width"]).toBe("0");
    expect(declsFor(css(), ".pillar-stickers")["min-width"]).toBe("0");
  });

  it("keeps the Set a target link within the band, its 48 px hit area drawn around it", () => {
    expect(declsFor(css(), ".pillar-set-target")["min-height"]).toBe("0");
    expect(declsFor(css(), ".pillar-set-target::after").inset).toBeTruthy();
  });
});

describe("today.css composer bar", () => {
  const composer = () => declsFor(css(), ".today-composer");

  it("is 12 px above and below the 48 px field, with the safe area added under it and no other fixed gap", () => {
    expect(composer()["padding-top"]).toBe("var(--space-12)");
    expect(composer()["padding-bottom"]).toBe(
      "calc(var(--space-12) + env(safe-area-inset-bottom))",
    );
    expect(composer().padding).toBeUndefined();
  });
});

describe("today.css delete control", () => {
  it("is at least 48 x 48 and uses danger, not action", () => {
    const body = bodyOf(/^\.food-item-delete$/);
    expect(body).toMatch(/min-(width|inline-size):\s*var\(--touch-target\)/);
    expect(body).toMatch(/min-(height|block-size):\s*var\(--touch-target\)/);
    expect(body).toMatch(/var\(--color-danger\)/);
    expect(body).not.toMatch(/--color-action/);
  });

  it("colours the delete error with danger", () => {
    expect(bodyOf(/^\.food-item-error$/)).toMatch(/var\(--color-danger\)/);
  });

  it("lets the row leave in 160 ms, and not at all under reduced motion", () => {
    expect(bodyOf(/^\.food-item-leaving$/)).toMatch(/var\(--motion-press\)/);
    expect(readWeb("src/styles/base.css")).toMatch(
      /prefers-reduced-motion:\s*reduce/,
    );
  });
});

describe("today.css header controls", () => {
  it.each([".today-day-button", ".today-settings"])(
    "makes %s 48 x 48",
    (cls) => {
      const body = bodyOfExact(cls);
      expect(body).toMatch(/border:/);
      expect(body).toMatch(
        /(min-)?(width|inline-size):\s*var\(--touch-target\)/,
      );
      expect(body).toMatch(
        /(min-)?(height|block-size):\s*var\(--touch-target\)/,
      );
    },
  );

  it("styles the journal's own item rows, since the preview sheet no longer shares them", () => {
    expect(bodyOfExact(".entries .food-items")).toMatch(/list-style:\s*none/);
    expect(bodyOfExact(".entries .food-item")).toMatch(/display:\s*grid/);
    expect(bodyOfExact(".entries .food-item")).toMatch(/border-top:/);
    expect(bodyOfExact(".entries .food-item-name")).toMatch(/display:\s*flex/);
    expect(bodyOfExact(".entries .food-item-detail")).toMatch(
      /grid-column:\s*1 \/ -1/,
    );
  });
});
