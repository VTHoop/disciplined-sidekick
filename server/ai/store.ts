import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidationIssue } from "./errors.js";

export type AiRunStatus =
  | "success"
  | "api_error"
  | "validation_error"
  | "refusal"
  | "truncated";

/** One `public.ai_runs` row, as inserted by the server. */
export interface AiRunRow {
  user_id: string | null;
  function_name: string;
  status: AiRunStatus;
  /** The model that answered; null when no answer came back. */
  model: string | null;
  /** The model the config asked for. */
  requested_model: string;
  effort: string;
  prompt_version: string;
  schema_version: string;
  attempts: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
  stop_reason: string | null;
  stop_details: unknown;
  input: unknown;
  output: unknown;
  validation_errors: ValidationIssue[] | null;
  error_message: string | null;
  started_at: string;
  finished_at: string;
}

export interface AiRunStore {
  insert(row: AiRunRow): Promise<void>;
}

/** Writes with the service-role client: users cannot insert into ai_runs. */
export function supabaseAiRunStore(supabase: SupabaseClient): AiRunStore {
  return {
    async insert(row) {
      const { error } = await supabase.from("ai_runs").insert(row);
      if (error) throw new Error(`ai_runs insert failed: ${error.message}`);
    },
  };
}
