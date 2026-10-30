import { describe, expect, it } from "vitest";
import {
  formatPillarFigure,
  PILLAR_LABEL,
  pillarSentence,
  pillarState,
  pillarTargetLabel,
  previewPillar,
} from "./pillars";

describe("pillarState", () => {
  it("fills consumed ÷ target and keeps the true total", () => {
    const s = pillarState("calories", 1100, 2200);
    expect(s.fill).toBeCloseTo(0.5, 10);
    expect(s.total).toBe(1100);
    expect(s.over).toBe(0);
    expect(s.reached).toBe(false);
  });

  it("stops the fill at the full bar while the total keeps counting", () => {
    const s = pillarState("calories", 2450, 2200);
    expect(s.fill).toBe(1);
    expect(s.total).toBe(2450);
  });

  it("counts fruit/veg grams toward its target", () => {
    const s = pillarState("fruitVeg", 300, 800);
    expect(s.fill).toBeCloseTo(0.375, 10);
    expect(s.reached).toBe(false);
  });

  it("states the amount over the calorie limit", () => {
    expect(pillarState("calories", 2450, 2200).over).toBe(250);
  });

  it("is not over exactly at the calorie limit", () => {
    expect(pillarState("calories", 2200, 2200).over).toBe(0);
  });

  it("is not over when the excess rounds away at the displayed whole kcal", () => {
    expect(pillarState("calories", 2200.4, 2200).over).toBe(0);
  });

  it("is over once the excess shows as a whole kcal", () => {
    expect(pillarState("calories", 2200.6, 2200).over).toBe(1);
  });

  it("reaches protein and fruit/veg at or above the goal", () => {
    expect(pillarState("protein", 139.4, 140).reached).toBe(false);
    expect(pillarState("protein", 139.5, 140).reached).toBe(true);
    expect(pillarState("protein", 140, 140).reached).toBe(true);
    expect(pillarState("protein", 148, 140).reached).toBe(true);
    expect(pillarState("fruitVeg", 800, 800).reached).toBe(true);
    expect(pillarState("fruitVeg", 640, 800).reached).toBe(false);
  });

  it("never reaches or goes over on the wrong pillar", () => {
    expect(pillarState("calories", 3000, 2200).reached).toBe(false);
    expect(pillarState("protein", 300, 140).over).toBe(0);
    expect(pillarState("fruitVeg", 1600, 800).over).toBe(0);
  });

  it("has no fill, over or reached without a target", () => {
    const s = pillarState("protein", 83.4, null);
    expect(s).toMatchObject({
      total: 83.4,
      target: null,
      fill: null,
      over: 0,
      reached: false,
    });
  });
});

describe("figures and sentences", () => {
  it("groups kcal thousands, rounds grams whole and protein to 1 decimal", () => {
    expect(formatPillarFigure("calories", 2450.4)).toBe("2,450");
    expect(formatPillarFigure("calories", 999.6)).toBe("1,000");
    expect(formatPillarFigure("calories", 0)).toBe("0");
    expect(formatPillarFigure("protein", 83.44)).toBe("83");
    expect(formatPillarFigure("protein", 0)).toBe("0");
    expect(formatPillarFigure("fruitVeg", 1234.4)).toBe("1234");
  });

  it("labels the target as a limit for calories and a goal for the rest", () => {
    expect(pillarTargetLabel("calories", 2200)).toBe("limit 2,200 kcal");
    expect(pillarTargetLabel("protein", 140)).toBe("goal 140 g");
    expect(pillarTargetLabel("fruitVeg", 800)).toBe("goal 800 g");
  });

  it("names the pillars", () => {
    expect(PILLAR_LABEL).toEqual({
      calories: "Calories",
      protein: "Protein",
      fruitVeg: "Fruit & veg",
    });
  });

  it("reads one sentence per pillar", () => {
    expect(pillarSentence(pillarState("calories", 2450, 2200))).toBe(
      "Calories: 2,450 kcal, limit 2,200 kcal, 250 over.",
    );
    expect(pillarSentence(pillarState("calories", 1800, 2200))).toBe(
      "Calories: 1,800 kcal, limit 2,200 kcal.",
    );
    expect(pillarSentence(pillarState("protein", 148, 140))).toBe(
      "Protein: 148 g, goal 140 g, reached.",
    );
    expect(pillarSentence(pillarState("fruitVeg", 640, 800))).toBe(
      "Fruit & veg: 640 g, goal 800 g.",
    );
    expect(pillarSentence(pillarState("protein", 83.4, null))).toBe(
      "Protein: 83 g, no target set.",
    );
  });

  it("adds what the entry adds, and only when it adds something", () => {
    expect(
      pillarSentence(pillarState("calories", 2877, 2200), { added: 677 }),
    ).toBe(
      "Calories: 2,877 kcal, limit 2,200 kcal, 677 over, this entry adds 677 kcal.",
    );
    expect(
      pillarSentence(pillarState("protein", 83.4, null), { added: 31 }),
    ).toBe("Protein: 83 g, no target set, this entry adds 31 g.");
    expect(
      pillarSentence(pillarState("protein", 83.4, 140), { added: 0 }),
    ).toBe("Protein: 83 g, goal 140 g.");
  });
});

describe("previewPillar", () => {
  it("adds the entry to the day and hatches its share of the bar", () => {
    const p = previewPillar("calories", 1000, 677, 2200);
    expect(p.after.total).toBe(1677);
    expect(p.added).toBe(677);
    expect(p.hatch?.from).toBeCloseTo(1000 / 2200, 10);
    expect(p.hatch?.to).toBeCloseTo(1677 / 2200, 10);
    expect(p.shareText).toBe("+677, limit 2,200 kcal");
  });

  it("hatches only the part of the entry inside the bar when it crosses the line", () => {
    const p = previewPillar("calories", 2000, 677, 2200);
    expect(p.hatch?.from).toBeCloseTo(2000 / 2200, 10);
    expect(p.hatch?.to).toBe(1);
    expect(p.after.over).toBe(477);
  });

  it("words a goal share with the goal", () => {
    expect(previewPillar("protein", 70, 31, 140).shareText).toBe(
      "+31, goal 140 g",
    );
    expect(previewPillar("fruitVeg", 300, 150, 800).shareText).toBe(
      "+150, goal 800 g",
    );
  });

  it("gets no hatch and no +0 when the amount rounds to 0", () => {
    const p = previewPillar("calories", 1000, 0.4, 2200);
    expect(p.added).toBe(0);
    expect(p.hatch).toBeNull();
    expect(p.shareText).toBeNull();
    const protein = previewPillar("protein", 70, 0.4, 140);
    expect(protein.added).toBe(0);
    expect(protein.shareText).toBeNull();
  });

  it("states the share without a hatch when there is no target", () => {
    const p = previewPillar("protein", 52.4, 31, null);
    expect(p.hatch).toBeNull();
    expect(p.shareText).toBe("+31 g from this entry");
    expect(p.after.total).toBeCloseTo(83.4, 10);
    expect(previewPillar("fruitVeg", 0, 31, null).shareText).toBe(
      "+31 g from this entry",
    );
    expect(previewPillar("calories", 0, 677, null).shareText).toBe(
      "+677 kcal from this entry",
    );
  });

  it("gets no hatch when the day was already at or past the line", () => {
    for (const day of [2200, 2500]) {
      const p = previewPillar("calories", day, 300, 2200);
      expect(p.hatch).toBeNull();
      expect(p.shareText).toBe("+300 kcal from this entry");
      expect(p.after.total).toBe(day + 300);
    }
    const reached = previewPillar("protein", 150, 20, 140);
    expect(reached.hatch).toBeNull();
    expect(reached.after.reached).toBe(true);
  });

  it("updates the sticker states for the total with the entry", () => {
    expect(previewPillar("calories", 2000, 677, 2200).after.over).toBe(477);
    expect(previewPillar("protein", 120, 25, 140).after.reached).toBe(true);
  });
});
