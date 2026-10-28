import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { supabaseFoodCache } from "./cache";

type DbError = { message: string } | null;

function stubSupabase({
  row = null,
  readError = null,
  writeError = null,
}: {
  row?: Record<string, unknown> | null;
  readError?: DbError;
  writeError?: DbError;
} = {}) {
  const reads: { table: string; column: string; value: unknown }[] = [];
  const writes: { table: string; row: unknown; options: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => ({
          maybeSingle: async () => {
            reads.push({ table, column, value });
            return { data: row, error: readError };
          },
        }),
      }),
      upsert: async (r: unknown, options: unknown) => {
        writes.push({ table, row: r, options });
        return { error: writeError };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, reads, writes };
}

describe("supabaseFoodCache", () => {
  it("reads a USDA pick by canonical key", async () => {
    const { client, reads } = stubSupabase({
      row: {
        source: "usda",
        fdc_id: 171711,
        description: "Blueberries, raw",
        kcal_per_100g: 57,
        protein_per_100g: 0.74,
      },
    });
    await expect(
      supabaseFoodCache(client).get("blueberries, raw"),
    ).resolves.toEqual({
      source: "usda",
      fdcId: 171711,
      description: "Blueberries, raw",
      kcalPer100g: 57,
      proteinPer100g: 0.74,
    });
    expect(reads).toEqual([
      {
        table: "food_cache",
        column: "canonical_key",
        value: "blueberries, raw",
      },
    ]);
  });

  it("reads an estimate", async () => {
    const { client } = stubSupabase({
      row: {
        source: "estimate",
        fdc_id: null,
        description: null,
        kcal_per_100g: 180,
        protein_per_100g: 8,
      },
    });
    await expect(supabaseFoodCache(client).get("mezeh")).resolves.toEqual({
      source: "estimate",
      kcalPer100g: 180,
      proteinPer100g: 8,
    });
  });

  it("returns null on a miss", async () => {
    const { client } = stubSupabase();
    await expect(supabaseFoodCache(client).get("nothing")).resolves.toBeNull();
  });

  it("writes a pick, leaving an existing row for the same key untouched", async () => {
    const { client, writes } = stubSupabase();
    await supabaseFoodCache(client).put("blueberries, raw", {
      source: "usda",
      fdcId: 171711,
      description: "Blueberries, raw",
      kcalPer100g: 57,
      proteinPer100g: 0.74,
    });
    expect(writes).toEqual([
      {
        table: "food_cache",
        row: {
          canonical_key: "blueberries, raw",
          source: "usda",
          fdc_id: 171711,
          description: "Blueberries, raw",
          kcal_per_100g: 57,
          protein_per_100g: 0.74,
        },
        options: { onConflict: "canonical_key", ignoreDuplicates: true },
      },
    ]);
  });

  it("writes an estimate with no FDC id or description", async () => {
    const { client, writes } = stubSupabase();
    await supabaseFoodCache(client).put("mezeh", {
      source: "estimate",
      kcalPer100g: 180,
      proteinPer100g: 8,
    });
    expect(writes[0]?.row).toEqual({
      canonical_key: "mezeh",
      source: "estimate",
      fdc_id: null,
      description: null,
      kcal_per_100g: 180,
      protein_per_100g: 8,
    });
  });

  it("throws when a read or write fails", async () => {
    const read = stubSupabase({ readError: { message: "permission denied" } });
    await expect(supabaseFoodCache(read.client).get("x")).rejects.toThrow(
      /food_cache read failed: permission denied/,
    );
    const write = stubSupabase({
      writeError: { message: "permission denied" },
    });
    await expect(
      supabaseFoodCache(write.client).put("x", {
        source: "estimate",
        kcalPer100g: 1,
        proteinPer100g: 1,
      }),
    ).rejects.toThrow(/food_cache write failed: permission denied/);
  });
});
