import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRUIT_VEG_G,
  MAX_TARGETS,
  parseTarget,
  resolveTargets,
  type StoredTargets,
  targetName,
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
  ])("accepts %j as %d", (raw, value) => {
    expect(parseTarget("calories", raw)).toEqual({ ok: true, value });
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

describe("MAX_TARGETS", () => {
  it("caps calories at 6,000 kcal, protein at 500 g and fruit/veg at 3,000 g", () => {
    expect(MAX_TARGETS).toEqual({
      calories: 6000,
      protein: 500,
      fruitVeg: 3000,
    });
  });
});

describe("parseTarget caps", () => {
  it.each([
    ["calories", 6000],
    ["protein", 500],
    ["fruitVeg", 3000],
  ] as const)("saves a %s value equal to the cap", (field, cap) => {
    expect(parseTarget(field, String(cap))).toEqual({ ok: true, value: cap });
  });

  it.each([
    ["calories", "6001", "Calories must be 6,000 kcal or less"],
    ["protein", "501", "Protein must be 500 g or less"],
    ["fruitVeg", "3001", "Fruit/veg must be 3,000 g or less"],
  ] as const)("rejects %s %s with the cap message", (field, raw, message) => {
    expect(parseTarget(field, raw)).toEqual({ ok: false, message });
  });

  it.each([String(Number.MAX_SAFE_INTEGER + 1), `1${"0".repeat(30)}`])(
    "gives a number beyond the safe range the cap message: %s",
    (raw) => {
      expect(parseTarget("protein", raw)).toEqual({
        ok: false,
        message: "Protein must be 500 g or less",
      });
    },
  );

  it.each(["6000.5", "-7000", "1e4", "7,000", "+7000"])(
    "gives %j the whole-number message even though it is above the cap",
    (raw) => {
      expect(parseTarget("calories", raw)).toEqual({
        ok: false,
        message: "Calories must be a whole number greater than 0",
      });
    },
  );
});

describe("targetName", () => {
  it("gives the display name used in messages", () => {
    expect(targetName("calories")).toBe("Calories");
    expect(targetName("protein")).toBe("Protein");
    expect(targetName("fruitVeg")).toBe("Fruit/veg");
  });
});
