import type { SupabaseClient } from "@supabase/supabase-js";

/** A cached lookup, keyed by lookupKey(brand, canonical name). Values are per 100 g. */
export type CachedFood =
  | {
      source: "usda";
      fdcId: number;
      description: string;
      kcalPer100g: number;
      proteinPer100g: number;
    }
  | {
      source: "branded";
      fdcId: number;
      description: string;
      brand: string;
      /** The label serving size when it is in grams, else null. */
      servingSizeG: number | null;
      kcalPer100g: number;
      proteinPer100g: number;
    }
  | {
      source: "estimate";
      /** The brand or restaurant the estimate was made for. */
      brand?: string;
      kcalPer100g: number;
      proteinPer100g: number;
    };

export interface FoodCache {
  get(key: string): Promise<CachedFood | null>;
  /** Adds a row; an existing row for the key is left as it is. */
  put(key: string, food: CachedFood): Promise<void>;
}

interface CacheRow {
  source: "usda" | "branded" | "estimate";
  fdc_id: number | null;
  description: string | null;
  brand: string | null;
  serving_size_g: number | null;
  kcal_per_100g: number;
  protein_per_100g: number;
}

const COLUMNS =
  "source, fdc_id, description, brand, serving_size_g, kcal_per_100g, protein_per_100g";

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
      if (data.source === "usda") {
        return {
          source: "usda",
          fdcId: data.fdc_id ?? 0,
          description: data.description ?? "",
          ...per100,
        };
      }
      if (data.source === "branded") {
        return {
          source: "branded",
          fdcId: data.fdc_id ?? 0,
          description: data.description ?? "",
          brand: data.brand ?? "",
          servingSizeG: data.serving_size_g,
          ...per100,
        };
      }
      return {
        source: "estimate",
        ...(data.brand ? { brand: data.brand } : {}),
        ...per100,
      };
    },
    async put(key, food) {
      const { error } = await supabase.from("food_cache").upsert(
        {
          canonical_key: key,
          source: food.source,
          fdc_id: food.source === "estimate" ? null : food.fdcId,
          description: food.source === "estimate" ? null : food.description,
          brand: food.source === "usda" ? null : (food.brand ?? null),
          serving_size_g: food.source === "branded" ? food.servingSizeG : null,
          kcal_per_100g: food.kcalPer100g,
          protein_per_100g: food.proteinPer100g,
        },
        { onConflict: "canonical_key", ignoreDuplicates: true },
      );
      if (error) throw new Error(`food_cache write failed: ${error.message}`);
    },
  };
}
