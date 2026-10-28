import { z } from "zod";
import type { AiFunction } from "../run.js";

interface PickCandidate {
  fdcId: number;
  description: string;
  dataType: string;
}

export interface PickFoodInput {
  canonicalName: string;
  candidates: PickCandidate[];
}

const outputSchema = z.object({ fdcId: z.number().int().nullable() });
export type PickFoodOutput = z.infer<typeof outputSchema>;

/** Picks the USDA result that best matches the food, or none. */
export const pickFoodFunction: AiFunction<PickFoodInput, PickFoodOutput> = {
  name: "pickFood",
  promptVersion: "pickFood@1",
  schemaVersion: "1",
  outputSchema,
  buildRequest: ({ canonicalName, candidates }) => ({
    system:
      "Pick the USDA FoodData Central result that best matches the food as " +
      "eaten (same food and preparation). Answer with its fdcId, or null if " +
      "none of them is the same food.",
    messages: [
      {
        role: "user",
        content: JSON.stringify({ food: canonicalName, candidates }),
      },
    ],
  }),
};
