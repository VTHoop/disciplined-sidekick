import { describe, expect, it } from "vitest";
import { parseEvalArgs } from "./args";

describe("parseEvalArgs", () => {
  it("runs every case 3 times by default", () => {
    expect(parseEvalArgs([])).toEqual({
      ok: true,
      repeats: 3,
      ids: [],
      categories: [],
    });
  });

  it("changes the repeat count with --repeats", () => {
    expect(parseEvalArgs(["--repeats", "5"])).toMatchObject({
      ok: true,
      repeats: 5,
    });
  });

  it.each([["0"], ["-1"], ["2.5"], ["x"]])("rejects --repeats %s", (value) => {
    expect(parseEvalArgs(["--repeats", value])).toEqual({
      ok: false,
      message: expect.stringContaining("--repeats"),
    });
  });

  it("limits the run to named cases, repeated or comma-separated", () => {
    expect(parseEvalArgs(["--case", "a", "--case", "b,c"])).toMatchObject({
      ok: true,
      ids: ["a", "b", "c"],
    });
  });

  it("limits the run to categories", () => {
    expect(parseEvalArgs(["--category", "branded,no-food"])).toMatchObject({
      ok: true,
      categories: ["branded", "no-food"],
    });
  });

  it("rejects an unknown flag or a stray argument", () => {
    expect(parseEvalArgs(["--model", "x"])).toMatchObject({ ok: false });
    expect(parseEvalArgs(["eggs"])).toMatchObject({ ok: false });
  });
});
