export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AiFunctionConfig {
  model: string;
  effort: Effort;
  maxTokens: number;
}

/**
 * One entry per AI function, keyed by the function's `name`. To change which
 * model or effort a function runs on, edit its entry here and add the model to
 * MODEL_PRICES; the function's own code does not change.
 */
export const AI_CONFIG = {
  demo: { model: "claude-haiku-5-5", effort: "low", maxTokens: 1024 },
} as const satisfies Record<string, AiFunctionConfig>;
