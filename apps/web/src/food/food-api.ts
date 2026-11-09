import type { FoodPreview, FoodSource } from "@disciplined-sidekick/core";
import {
  DataError,
  type FailureKind,
  failureKind,
  type RecordFailure,
  report,
  toDataError,
  toThrownError,
} from "../client-errors";

export type ParseResult =
  | { ok: true; preview: FoodPreview }
  | { ok: false; reason: "no_food" | "failed" | "session" };

export type SaveResult = { ok: true } | { ok: false; reason: FailureKind };

export interface FoodApi {
  /** Parses and looks the entry up on the server. Saves nothing. */
  parse(text: string): Promise<ParseResult>;
  /**
   * Done: saves the entry and all its items. A failed save is recorded; if the
   * response was lost but the entry exists, it counts as saved.
   */
  save(preview: FoodPreview, localDate: string): Promise<SaveResult>;
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
  /** The parse's grams when the user edited them; null if unedited. */
  parsed_grams: number | null;
  fdc_id: number | null;
  brand: string | null;
  source: FoodSource;
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
  ): PromiseLike<{
    error: { message: string; code?: string } | null;
    status?: number;
  }>;
  from(table: "food_entries"): {
    select(columns: "id"): {
      eq(
        column: "id",
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
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
  record,
}: {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
  db: FoodDb;
  record: RecordFailure;
}): FoodApi {
  /** Whether the entry is saved. Any failure to find out counts as "no". */
  const entryExists = async (entryId: string) => {
    try {
      const { data, error } = await db
        .from("food_entries")
        .select("id")
        .eq("id", entryId)
        .maybeSingle();
      return !error && data?.id === entryId;
    } catch {
      return false;
    }
  };

  return {
    async parse(text) {
      let res: Response;
      try {
        res = await apiFetch("/api/food/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      } catch (e) {
        // Offline or the request failed.
        report(record, "parse", toThrownError(e));
        return { ok: false, reason: "failed" };
      }
      const body: unknown = await res.json().catch(() => null);
      if (res.ok && isPreview(body)) return { ok: true, preview: body };
      const serverError =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : null;
      if (res.status === 422 && serverError === "no_food") {
        return { ok: false, reason: "no_food" };
      }
      report(
        record,
        "parse",
        new DataError(res.ok ? "Unexpected response" : `HTTP ${res.status}`, {
          code: serverError,
          status: res.status,
        }),
      );
      return { ok: false, reason: res.status === 401 ? "session" : "failed" };
    },
    async save(preview, localDate) {
      let failure: DataError;
      try {
        const { error, status } = await db.rpc("save_food_entry", {
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
            parsed_grams: i.parsedGrams ?? null,
            fdc_id: i.fdcId,
            brand: i.brand,
            source: i.source,
          })),
        });
        if (!error) return { ok: true };
        failure = toDataError(error, status);
      } catch (e) {
        failure = toThrownError(e);
      }
      report(record, "save", failure);
      const kind = failureKind(failure);
      // The response may have been lost after the save committed. The entry id
      // is fixed per preview, so finding it means the save is done.
      if (kind === "network" && (await entryExists(preview.entryId))) {
        return { ok: true };
      }
      return { ok: false, reason: kind };
    },
  };
}
