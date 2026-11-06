import { describe, expect, it } from "vitest";
import {
  readStyle,
  readTokens,
  readWeb,
  stripComments,
} from "../styles/css-test-utils";

const css = () => stripComments(readWeb("src/update/update-notice.css"));

function bodyOf(selector: RegExp) {
  return [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => selector.test((m[1] as string).trim()))
    .map((m) => m[2])
    .join(";");
}

describe("update-notice.css", () => {
  it("is loaded by the update notice", () => {
    expect(readWeb("src/update/update-notice.tsx")).toMatch(
      /import\s+["']\.\/update-notice\.css["']/,
    );
  });

  it("keeps the Reload button at least 48 px tall", () => {
    expect(bodyOf(/\.update-notice button$/)).toMatch(
      /min-height:\s*var\(--touch-target\)/,
    );
    const { light } = readTokens(readStyle("tokens.css"));
    expect(
      Number.parseInt(light["--touch-target"] ?? "", 10),
    ).toBeGreaterThanOrEqual(48);
  });

  it("collapses the bar with no update without removing its status region", () => {
    const collapsed = bodyOf(/\.update-notice:not\(\[data-available\]\)$/);
    expect(collapsed).toMatch(/height:\s*0/);
    expect(collapsed).toMatch(/overflow:\s*hidden/);
    expect(collapsed).not.toMatch(/display:\s*none/);
  });

  it("does not rely on the hidden attribute, which display:flex overrides", () => {
    expect(readWeb("src/update/update-notice.tsx")).not.toMatch(/\bhidden=/);
  });
});
