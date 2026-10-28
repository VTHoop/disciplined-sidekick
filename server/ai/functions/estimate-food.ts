import { z } from "zod";
import type { AiFunction } from "../run.js";

export interface EstimateFoodInput {
  canonicalName: string;
}

const outputSchema = z.object({
  kcalPer100g: z.number().min(0),
  proteinPer100g: z.number().min(0).max(100),
});
export type EstimateFoodOutput = z.infer<typeof outputSchema>;

/** Estimates kcal and protein per 100 g for a food with no usable USDA match. */
export const estimateFoodFunction: AiFunction<
  EstimateFoodInput,
  EstimateFoodOutput
> = {
  name: "estimateFood",
  promptVersion: "estimateFood@1",
  schemaVersion: "1",
  outputSchema,
  buildRequest: ({ canonicalName }) => ({
    system:
      "Estimate the energy (kcal) and protein (g) per 100 g of the food as " +
      "eaten, from typical recipes and nutrition data.",
    messages: [{ role: "user", content: canonicalName }],
  }),
};
