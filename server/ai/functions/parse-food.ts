import { z } from "zod";
import { fruitVegRulesText } from "../../../packages/core/src/index.js";
import type { AiFunction } from "../run.js";

export interface ParseFoodInput {
  text: string;
}

const nonBlank = z.string().refine((s) => s.trim().length > 0, "blank");

const itemSchema = z.object({
  name: nonBlank,
  canonicalName: nonBlank,
  usdaQuery: nonBlank,
  grams: z.number().positive(),
  portionEstimated: z.boolean(),
  countsFruitVeg: z.boolean(),
});

const outputSchema = z.object({ items: z.array(itemSchema) });
export type ParsedFoodItem = z.infer<typeof itemSchema>;
export type ParseFoodOutput = z.infer<typeof outputSchema>;

const SYSTEM = `You split a food log entry into the foods it describes.

For each food return:
- name: a short display name, e.g. "Eggs" or "Blueberries".
- canonicalName: a generic, lower-case name for the food as eaten, e.g. "egg, whole, cooked" or "blueberries, raw". The same food must always get the same canonicalName.
- usdaQuery: search words for the USDA FoodData Central database, e.g. "egg whole cooked".
- grams: the weight eaten, in grams. Convert counts and household measures to grams.
- portionEstimated: true if you guessed the grams (no quantity was given, or it is a component of a mixed dish), false if the grams follow from what was written.
- countsFruitVeg: whether the food counts toward the 800 g fruit/veg target, using the rules below.

A mixed dish named without its component weights (e.g. "Mezeh bowl", "big salad") is split into component items with estimated grams, each with portionEstimated true; the qualifying components count toward fruit/veg. A dish whose components are listed with their weights is logged as written, one item per listed component.

If the entry describes no food, return no items.

800 g fruit/veg rules:
${fruitVegRulesText()}`;

/** Splits free text into items with grams, a canonical name, a USDA query and the fruit/veg mark. */
export const parseFoodFunction: AiFunction<ParseFoodInput, ParseFoodOutput> = {
  name: "parseFood",
  promptVersion: "parseFood@1",
  schemaVersion: "1",
  outputSchema,
  buildRequest: ({ text }) => ({
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
  }),
};
