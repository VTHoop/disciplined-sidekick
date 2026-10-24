import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { type AiRunRow, supabaseAiRunStore } from "./store";

const row = { function_name: "echo", status: "success" } as AiRunRow;

function stubSupabase(result: { error: { message: string } | null }) {
  const inserted: { table: string; row: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      insert: async (r: unknown) => {
        inserted.push({ table, row: r });
        return result;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, inserted };
}

describe("supabaseAiRunStore", () => {
  it("inserts the row into ai_runs", async () => {
    const { client, inserted } = stubSupabase({ error: null });
    await supabaseAiRunStore(client).insert(row);
    expect(inserted).toEqual([{ table: "ai_runs", row }]);
  });

  it("throws when Supabase reports an error, so the runner logs the run as not recorded", async () => {
    const { client } = stubSupabase({
      error: { message: "permission denied for table ai_runs" },
    });
    await expect(supabaseAiRunStore(client).insert(row)).rejects.toThrow(
      /ai_runs insert failed: permission denied for table ai_runs/,
    );
  });
});
