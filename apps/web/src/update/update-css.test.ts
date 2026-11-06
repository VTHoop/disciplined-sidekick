import { describe, expect, it } from "vitest";
import { readWeb, stripComments } from "../styles/css-test-utils";

const css = () => stripComments(readWeb("src/update/update-notice.css"));

describe("update-notice.css", () => {
  it("is loaded by the update notice", () => {
    expect(readWeb("src/update/update-notice.tsx")).toMatch(
      /import\s+["']\.\/update-notice\.css["']/,
    );
  });

  it("keeps the Reload button at least 48 px tall", () => {
    expect(css()).toMatch(/min-height:\s*var\(--touch-target\)/);
  });
});
