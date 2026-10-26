import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRUIT_VEG_G,
  parseTarget,
  resolveTargets,
  type StoredTargets,
} from "./targets";

const unedited: StoredTargets = {
  calories: null,
  protein: null,
  fruitVeg: null,
  fruitVegEdited: false,
};

describe("DEFAULT_FRUIT_VEG_G", () => {
  it("is 800 g", () => {
    expect(DEFAULT_FRUIT_VEG_G).toBe(800);
  });
});

describe("resolveTargets", () => {
  it("gives a user with no row 800 g fruit/veg and unset calories and protein", () => {
    expect(resolveTargets(null)).toEqual({
      calories: null,
      protein: null,
      fruitVeg: 800,
    });
  });

  it("gives a user who never edited fruit/veg the default", () => {
    expect(resolveTargets({ ...unedited, calories: 2000 })).toEqual({
      calories: 2000,
      protein: null,
      fruitVeg: 800,
    });
  });

  it("follows a changed default for a user who never edited fruit/veg", () => {
    expect(resolveTargets(null, { fruitVeg: 900 }).fruitVeg).toBe(900);
    expect(resolveTargets(unedited, { fruitVeg: 900 }).fruitVeg).toBe(900);
  });

  it("ignores a stored fruit/veg value until the user has edited it", () => {
    expect(
      resolveTargets({ ...unedited, fruitVeg: 300 }, { fruitVeg: 900 })
        .fruitVeg,
    ).toBe(900);
  });

  it("keeps the user's own fruit/veg value when the default changes", () => {
    const edited = { ...unedited, fruitVeg: 500, fruitVegEdited: true };
    expect(resolveTargets(edited, { fruitVeg: 900 }).fruitVeg).toBe(500);
  });

  it("keeps a cleared fruit/veg target unset instead of reverting to 800", () => {
    const cleared = { ...unedited, fruitVegEdited: true };
    expect(resolveTargets(cleared).fruitVeg).toBeNull();
    expect(resolveTargets(cleared, { fruitVeg: 900 }).fruitVeg).toBeNull();
  });
});

describe("parseTarget", () => {
  it.each([
    ["2000", 2000],
    ["1", 1],
    [" 120 ", 120],
    ["007", 7],
    ["99999999999", 99999999999],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])("accepts %j as %d", (raw, value) => {
    expect(parseTarget("protein", raw)).toEqual({ ok: true, value });
  });

  it.each(["", "   "])("treats %j as clearing the target", (raw) => {
    for (const field of ["calories", "protein", "fruitVeg"] as const) {
      expect(parseTarget(field, raw)).toEqual({ ok: true, value: null });
    }
  });

  it.each([
    "abc",
    "12abc",
    "1.5",
    "12.0",
    "0.5",
    "0",
    "00",
    "-3",
    "+5",
    "1e3",
    "0x10",
    "1,000",
    "1 000",
    String(Number.MAX_SAFE_INTEGER + 1),
  ])("rejects %j", (raw) => {
    expect(parseTarget("protein", raw).ok).toBe(false);
  });

  it("names the field and states the rule in the message", () => {
    expect(parseTarget("calories", "abc")).toEqual({
      ok: false,
      message: "Calories must be a whole number greater than 0",
    });
    expect(parseTarget("protein", "0")).toEqual({
      ok: false,
      message: "Protein must be a whole number greater than 0",
    });
    expect(parseTarget("fruitVeg", "-1")).toEqual({
      ok: false,
      message: "Fruit/veg must be a whole number greater than 0",
    });
  });
});
