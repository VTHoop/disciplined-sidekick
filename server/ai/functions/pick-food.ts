import { z } from "zod";
import type { AiFunction } from "../run.js";

interface PickCandidate {
  fdcId: number;
  description: string;
  dataType: string;
  /** Branded results only. */
  brandOwner?: string;
  brandName?: string;
}

export interface PickFoodInput {
  canonicalName: string;
  /** The brand the entry named; set for a branded item. */
  brand?: string;
  candidates: PickCandidate[];
}

const outputSchema = z.object({ fdcId: z.number().int().nullable() });
export type PickFoodOutput = z.infer<typeof outputSchema>;

const GENERIC_SYSTEM =
  "Pick the USDA FoodData Central result that best matches the food as " +
  "eaten (same food and preparation). Answer with its fdcId, or null if " +
  "none of them is the same food.";

const BRANDED_SYSTEM =
  "Pick the USDA FoodData Central Branded result that is the named brand's " +
  "version of the food (same food and preparation). A candidate counts only " +
  "if its brandOwner or brandName is the named brand. A store brand, or any " +
  "other brand, is not a match. Answer with its fdcId, or null if none of " +
  "the candidates is from the named brand.";

/** Picks the USDA result that best matches the food (and brand), or none. */
export const pickFoodFunction: AiFunction<PickFoodInput, PickFoodOutput> = {
  name: "pickFood",
  promptVersion: "pickFood@2",
  schemaVersion: "1",
  outputSchema,
  buildRequest: ({ canonicalName, brand, candidates }) => ({
    system: brand ? BRANDED_SYSTEM : GENERIC_SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          food: canonicalName,
          ...(brand ? { brand } : {}),
          candidates,
        }),
      },
    ],
  }),
};
