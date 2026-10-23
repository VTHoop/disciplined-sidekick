import { z } from "zod";
import type { AiFunction } from "../run.js";

export const MEAL_CATEGORIES = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "unknown",
] as const;

export interface DemoInput {
  text: string;
}

const outputSchema = z.object({ category: z.enum(MEAL_CATEGORIES) });
export type DemoOutput = z.infer<typeof outputSchema>;

/** Minimal typed AI function: proves the call layer end to end. */
export const demoFunction: AiFunction<DemoInput, DemoOutput> = {
  name: "demo",
  promptVersion: "demo@1",
  schemaVersion: "1",
  outputSchema,
  buildRequest: ({ text }) => ({
    system:
      "Classify the meal described by the user as breakfast, lunch, dinner, " +
      "snack or unknown. Answer with the category only.",
    messages: [{ role: "user", content: text }],
  }),
};
