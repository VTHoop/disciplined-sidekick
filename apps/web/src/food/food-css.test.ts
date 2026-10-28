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
