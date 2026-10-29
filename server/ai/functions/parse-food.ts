import { z } from "zod";
import { fruitVegRulesText } from "../../../packages/core/src/index.js";
import type { AiFunction } from "../run.js";

export interface ParseFoodInput {
  text: string;
}

// The model sees minLength; validation also trims, so later steps get clean names.
const nonBlank = z.string().trim().min(1);

const itemSchema = z
  .object({
    name: nonBlank,
    canonicalName: nonBlank,
    usdaQuery: nonBlank,
    grams: z.number().positive(),
    portionEstimated: z.boolean(),
    countsFruitVeg: z.boolean(),
    brand: nonBlank.nullable(),
    path: z.enum(["generic", "branded", "restaurant"]),
    servings: z.number().positive().nullable(),
  })
  .refine((item) => (item.path === "generic") === (item.brand === null), {
    message:
      "A branded or restaurant item needs a brand; a generic item has none",
    path: ["brand"],
  });

const outputSchema = z.object({ items: z.array(itemSchema) });
export type ParsedFoodItem = z.infer<typeof itemSchema>;
export type ParseFoodOutput = z.infer<typeof outputSchema>;

const SYSTEM = `You split a food log entry into the foods it describes.

For each food return:
- name: a short display name, e.g. "Eggs" or "Blueberries".
- canonicalName: the food as eaten, in generic lower-case words with no brand or restaurant name in it, e.g. "egg, whole, cooked" or "plain greek yogurt". The same food must always get the same canonicalName.
- usdaQuery: search words for the USDA FoodData Central database, without the brand, e.g. "egg whole cooked".
- grams: the weight eaten, in grams. Convert counts and household measures to grams.
- portionEstimated: true if you guessed the grams (no quantity was given, or it is a component of a mixed dish), false if the grams follow from what was written.
- countsFruitVeg: whether the food counts toward the 800 g fruit/veg target, using the rules below.
- brand: the brand or restaurant name as written, or null when the entry names none.
- path: "generic" when no brand is named (brand is null); "branded" for a packaged product from a named brand, e.g. "Chobani plain greek yogurt, 170 g" is one branded item with brand "Chobani"; "restaurant" for food from a named chain or restaurant, e.g. "Chipotle chicken, white rice and black beans" is three restaurant items, each with brand "Chipotle". A branded or restaurant item always has a brand.
- servings: the quantity in label servings when the entry gives one ("2 servings", or "1 bar" for a bar sold as one serving), else null. Still fill in grams as your best guess.

A mixed dish named without its component weights (e.g. "Mezeh bowl", "big salad") is split into component items with estimated grams, each with portionEstimated true; the qualifying components count toward fruit/veg. A dish whose components are listed with their weights is logged as written, one item per listed component.

If the entry describes no food, return no items.

800 g fruit/veg rules:
${fruitVegRulesText()}`;

/** Splits free text into items with grams, a canonical name, a USDA query, the fruit/veg mark, and the brand and path each item takes. */
export const parseFoodFunction: AiFunction<ParseFoodInput, ParseFoodOutput> = {
  name: "parseFood",
  promptVersion: "parseFood@2",
  schemaVersion: "1",
  outputSchema,
  buildRequest: ({ text }) => ({
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
  }),
};
