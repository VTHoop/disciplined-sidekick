import { z } from "zod";
import type { AiFunction } from "../run.js";

export interface EstimateFoodInput {
  canonicalName: string;
  /** The brand or restaurant the entry named. */
  brand?: string;
  /** Why the food has no USDA values: a brand USDA lacks, or a restaurant. */
  path?: "branded" | "restaurant";
}

const outputSchema = z.object({
  kcalPer100g: z.number().min(0),
  proteinPer100g: z.number().min(0).max(100),
});
export type EstimateFoodOutput = z.infer<typeof outputSchema>;

const GENERIC_SYSTEM =
  "Estimate the energy (kcal) and protein (g) per 100 g of the food as " +
  "eaten, from typical recipes and nutrition data.";

const BRANDED_SYSTEM =
  "Estimate the energy (kcal) and protein (g) per 100 g of the packaged " +
  "product from the named brand, as sold. Use that brand's published " +
  "nutrition label if you know it, else typical values for the product.";

const RESTAURANT_SYSTEM =
  "Estimate the energy (kcal) and protein (g) per 100 g of the menu item " +
  "from the named restaurant, as served. Use the restaurant's published " +
  "nutrition information if you know it, else typical values for the dish.";

/** Estimates kcal and protein per 100 g for a food with no usable USDA match. */
export const estimateFoodFunction: AiFunction<
  EstimateFoodInput,
  EstimateFoodOutput
> = {
  name: "estimateFood",
  promptVersion: "estimateFood@2",
  schemaVersion: "1",
  outputSchema,
  buildRequest: ({ canonicalName, brand, path }) => {
    if (!brand) {
      return {
        system: GENERIC_SYSTEM,
        messages: [{ role: "user", content: canonicalName }],
      };
    }
    return {
      system: path === "restaurant" ? RESTAURANT_SYSTEM : BRANDED_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({ brand, food: canonicalName }),
        },
      ],
    };
  },
};
