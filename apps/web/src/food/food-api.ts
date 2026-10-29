import type { FoodPreview } from "@disciplined-sidekick/core";

export type ParseResult =
  | { ok: true; preview: FoodPreview }
  | { ok: false; reason: "no_food" | "failed" };

export interface FoodApi {
  /** Parses and looks the entry up on the server. Saves nothing. */
  parse(text: string): Promise<ParseResult>;
  /** Done: saves the entry and all its items. Rejects if the save fails. */
  save(preview: FoodPreview, localDate: string): Promise<void>;
}

interface SaveItem {
  name: string;
  canonical_name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  fruit_veg_g: number;
  kcal_per_100g: number;
  protein_per_100g: number;
  estimated: boolean;
  portion_estimated: boolean;
  fdc_id: number | null;
  brand: string | null;
  source: "usda" | "branded" | "estimated";
}

interface SaveEntryArgs {
  p_entry_id: string;
  p_text: string;
  p_local_date: string;
  p_items: SaveItem[];
}

/** The slice of the supabase-js client the API uses, so it can be tested without a network. */
export interface FoodDb {
  rpc(
    fn: "save_food_entry",
    args: SaveEntryArgs,
  ): PromiseLike<{ error: { message: string } | null }>;
}

const isPreview = (body: unknown): body is FoodPreview =>
  typeof body === "object" &&
  body !== null &&
  "entryId" in body &&
  typeof body.entryId === "string" &&
  "items" in body &&
  Array.isArray(body.items) &&
  "totals" in body &&
  typeof body.totals === "object";

/**
 * Parsing goes through our own /api (the USDA key stays on the server). Saving
 * calls save_food_entry with the user's JWT, so row level security applies.
 */
export function createFoodApi({
  apiFetch,
  db,
}: {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
  db: FoodDb;
}): FoodApi {
  return {
    async parse(text) {
      try {
        const res = await apiFetch("/api/food/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (res.ok && isPreview(body)) return { ok: true, preview: body };
        if (
          res.status === 422 &&
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          body.error === "no_food"
        ) {
          return { ok: false, reason: "no_food" };
        }
      } catch {
        // Offline or the request failed: the same retry message.
      }
      return { ok: false, reason: "failed" };
    },
    async save(preview, localDate) {
      const { error } = await db.rpc("save_food_entry", {
        p_entry_id: preview.entryId,
        p_text: preview.text,
        p_local_date: localDate,
        p_items: preview.items.map((i) => ({
          name: i.name,
          canonical_name: i.canonicalName,
          grams: i.grams,
          kcal: i.kcal,
          protein_g: i.protein,
          fruit_veg_g: i.fruitVegG,
          kcal_per_100g: i.kcalPer100g,
          protein_per_100g: i.proteinPer100g,
          estimated: i.estimated,
          portion_estimated: i.portionEstimated,
          fdc_id: i.fdcId,
          brand: i.brand,
          source: i.source,
        })),
      });
      if (error) throw new Error(error.message);
    },
  };
}
