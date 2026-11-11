import { describe, expect, it } from "vitest";
import { readWeb, stripComments } from "../styles/css-test-utils";

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

  it("keeps Log beside the field, aligned to the field's bottom edge", () => {
    const row = rules(css()).find((r) => r.selector === ".food-log-row");
    expect(row?.body).toMatch(/display\s*:\s*flex/);
    expect(row?.body).toMatch(/align-items\s*:\s*flex-end/);
    const button = rules(css()).find(
      (r) => r.selector === ".food-log-row button",
    );
    expect(button?.body).toMatch(/flex\s*:\s*none/);
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
