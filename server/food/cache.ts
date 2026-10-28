import type { SupabaseClient } from "@supabase/supabase-js";

/** A cached lookup, keyed by canonicalKey(canonical name). Values are per 100 g. */
export type CachedFood =
  | {
      source: "usda";
      fdcId: number;
      description: string;
      kcalPer100g: number;
      proteinPer100g: number;
    }
  | { source: "estimate"; kcalPer100g: number; proteinPer100g: number };

export interface FoodCache {
  get(key: string): Promise<CachedFood | null>;
  /** Adds a row; an existing row for the key is left as it is. */
  put(key: string, food: CachedFood): Promise<void>;
}

interface CacheRow {
  source: "usda" | "estimate";
  fdc_id: number | null;
  description: string | null;
  kcal_per_100g: number;
  protein_per_100g: number;
}

const COLUMNS = "source, fdc_id, description, kcal_per_100g, protein_per_100g";

/** Reads and adds rows with the service-role client: users have no access to food_cache. */
export function supabaseFoodCache(supabase: SupabaseClient): FoodCache {
  return {
    async get(key) {
      const { data, error } = await supabase
        .from("food_cache")
        .select(COLUMNS)
        .eq("canonical_key", key)
        .maybeSingle<CacheRow>();
      if (error) throw new Error(`food_cache read failed: ${error.message}`);
      if (!data) return null;
      const per100 = {
        kcalPer100g: data.kcal_per_100g,
        proteinPer100g: data.protein_per_100g,
      };
      return data.source === "usda"
        ? {
            source: "usda",
            fdcId: data.fdc_id ?? 0,
            description: data.description ?? "",
            ...per100,
          }
        : { source: "estimate", ...per100 };
    },
    async put(key, food) {
      const { error } = await supabase.from("food_cache").upsert(
        {
          canonical_key: key,
          source: food.source,
          fdc_id: food.source === "usda" ? food.fdcId : null,
          description: food.source === "usda" ? food.description : null,
          kcal_per_100g: food.kcalPer100g,
          protein_per_100g: food.proteinPer100g,
        },
        { onConflict: "canonical_key", ignoreDuplicates: true },
      );
      if (error) throw new Error(`food_cache write failed: ${error.message}`);
    },
  };
}
