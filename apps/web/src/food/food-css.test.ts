import { describe, expect, it } from "vitest";
import {
  declsFor,
  extractBlock,
  readWeb,
  stripComments,
} from "../styles/css-test-utils";

const css = () => stripComments(readWeb("src/food/food.css"));

/** Every `selector { ... }` rule outside at-rules flattened, with its declarations. */
function rules(source: string) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] as string).trim(),
    body: m[2] as string,
  }));
}

describe("food.css", () => {
  it("is loaded by the food log", () => {
    expect(readWeb("src/food/food-log.tsx")).toMatch(
      /import\s+["']\.\/food\.css["']/,
    );
  });

  it("keeps the grams field at least the 48 px touch target tall", () => {
    const field = rules(css()).find((r) => r.selector === ".food-item-grams");
    expect(field, ".food-item-grams rule").toBeTruthy();
    expect(field?.body).toMatch(/min-height\s*:\s*var\(--touch-target\)/);
    expect(field?.body).not.toMatch(/(?:^|;)\s*(?:max-)?height\s*:/);
  });

  it("grows the composer field with its content, up to 4 lines, then scrolls inside it", () => {
    const field = rules(css()).find(
      (r) => r.selector === ".food-log-row textarea",
    );
    expect(field, ".food-log-row textarea rule").toBeTruthy();
    expect(field?.body).toMatch(/field-sizing\s*:\s*content/);
    expect(field?.body).toMatch(/max-height\s*:[^;]*\b4\b/);
    expect(field?.body).toMatch(/overflow-y\s*:\s*auto/);
    expect(field?.body).toMatch(/resize\s*:\s*none/);
  });

  it("keeps the composer's field at least the 48 px touch target tall", () => {
    const field = rules(css()).find(
      (r) => r.selector === ".food-log-row textarea",
    );
    expect(field?.body).toMatch(/min-height\s*:\s*var\(--touch-target\)/);
  });

  it("adds no margin or gap around the composer's form, so the bar is the field plus its padding", () => {
    expect(declsFor(css(), ".food-log").margin).toBe("0");
    expect(declsFor(css(), ".food-log-form").gap).toBe("0");
  });

  it("shows its status and errors in the flow under the field, never laid over it", () => {
    const status = declsFor(css(), ".food-log-status");
    expect(status.position).toBeUndefined();
    expect(status["min-height"]).toBeUndefined();
    expect(status.margin).toBe("0");
  });

  it("gives the composer's empty alert no margin, so it takes no room until an error lands in it", () => {
    const alert = declsFor(css(), '.food-log > [role="alert"]');
    expect(alert.margin).toBe("0");
    expect(alert.position).toBeUndefined();
  });

  it("colours the placeholder with its own token", () => {
    expect(declsFor(css(), ".food-log-row textarea::placeholder").color).toBe(
      "var(--color-placeholder)",
    );
    expect(declsFor(css(), ".food-log-row textarea::placeholder").opacity).toBe(
      "1",
    );
  });

  it("keeps Log beside the field, aligned to the field's bottom edge", () => {
    const row = rules(css()).find((r) => r.selector === ".food-log-row");
    expect(row?.body).toMatch(/display\s*:\s*flex/);
    expect(row?.body).toMatch(/align-items\s*:\s*flex-end/);
    const button = rules(css()).find(
      (r) => r.selector === ".food-log-row button",
    );
    expect(button?.body).toMatch(/flex\s*:\s*none/);
  });

  describe("preview sheet layout", () => {
    const rule = (selector: string) =>
      rules(css()).find((r) => r.selector === selector)?.body ?? "";

    it("does not scroll as a whole; the item list is the one scroller", () => {
      expect(rule(".food-sheet")).toMatch(/overflow(?:-y)?\s*:\s*hidden/);
      expect(rule(".food-sheet")).toMatch(/max-height\s*:\s*90dvh/);
      expect(rule(".food-sheet .food-items")).toMatch(/overflow-y\s*:\s*auto/);
      expect(rule(".food-sheet .food-items")).toMatch(/flex\s*:\s*1 1 auto/);
      expect(rule(".food-sheet .food-items")).toMatch(/min-height\s*:/);
    });

    it("never shrinks the header, card, total or actions", () => {
      for (const s of [
        ".food-sheet-grab",
        ".food-sheet-card",
        ".food-total",
        ".food-sheet-actions",
      ]) {
        expect(rule(s), s).toMatch(/flex\s*:\s*none/);
      }
      expect(rule(".food-sheet-card .price-card")).toMatch(
        /flex-shrink\s*:\s*0|flex\s*:\s*none/,
      );
    });

    it("compacts each pillar band to 40 px", () => {
      expect(rule(".food-sheet .pillar")).toMatch(
        /(?:block-size|height)\s*:\s*40px/,
      );
      expect(rule(".food-sheet .pillar")).toMatch(/min-height\s*:\s*0/);
      expect(rule(".food-sheet .pillar-sublabel")).toMatch(
        /display\s*:\s*none/,
      );
      expect(rule(".food-sheet .pillar-share-rest")).toMatch(
        /display\s*:\s*none/,
      );
    });

    it("makes an item row 60 px: the 48 px grams field plus 6 px above and below", () => {
      expect(rule(".food-sheet-item")).toMatch(/padding\s*:\s*6px 0/);
      expect(rule(".food-sheet-item")).toMatch(
        /grid-template-columns\s*:\s*auto 1fr auto/,
      );
    });

    it("hides the card on a viewport 540 px tall or less and keeps one row visible", () => {
      const media = extractBlock(css(), /@media\s*\(max-height:\s*540px\)/);
      expect(media, "@media (max-height: 480px)").toBeTruthy();
      expect(media?.inner).toMatch(
        /\.food-sheet-card\s*\{[^}]*display\s*:\s*none/,
      );
      expect(rule(".food-sheet .food-items")).toMatch(/min-height\s*:\s*60px/);
    });
  });

  it("never shrinks a button below the 48 px touch target (Done and Undo inherit it from base.css)", () => {
    for (const { selector, body } of rules(css())) {
      if (!/button|\[role=.?button/.test(selector)) continue;
      for (const m of body.matchAll(
        /(?:^|;)\s*((?:min-|max-)?(?:height|block-size))\s*:\s*([^;]+)/g,
      )) {
        const prop = m[1] as string;
        const value = (m[2] as string).trim();
        if (prop.startsWith("max-") || prop === "height") {
          throw new Error(`${selector} sets ${prop}: ${value}`);
        }
        expect(value, `${selector} ${prop}`).toBe("var(--touch-target)");
      }
    }
  });
});
