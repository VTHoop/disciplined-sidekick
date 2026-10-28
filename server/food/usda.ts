import { z } from "zod";
import type { FdcNutrient } from "../../packages/core/src/index.js";

export const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
export const USDA_DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)"];
/** How many results the pick step chooses from. */
export const USDA_PAGE_SIZE = 5;

/** The search failed (network, non-2xx, or an unreadable body). Not "no results". */
export class UsdaError extends Error {}

export interface UsdaFood {
  fdcId: number;
  description: string;
  dataType: string;
  /** Per 100 g. */
  foodNutrients: FdcNutrient[];
}

export interface UsdaClient {
  search(query: string): Promise<UsdaFood[]>;
}

const searchResponse = z.object({
  foods: z.array(
    z.object({
      fdcId: z.number(),
      description: z.string(),
      dataType: z.string(),
      foodNutrients: z
        .array(
          z.object({
            nutrientId: z.number(),
            value: z.number().nullish(),
          }),
        )
        .default([]),
    }),
  ),
});

/** Searches FoodData Central server-side; the key travels in a header, never a URL. */
export function createUsdaClient({
  apiKey,
  fetch: fetchImpl = fetch,
}: {
  apiKey: string;
  fetch?: typeof fetch;
}): UsdaClient {
  return {
    async search(query) {
      let res: Response;
      try {
        res = await fetchImpl(USDA_SEARCH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
          body: JSON.stringify({
            query,
            dataType: USDA_DATA_TYPES,
            pageSize: USDA_PAGE_SIZE,
          }),
        });
      } catch (cause) {
        throw new UsdaError("USDA search failed: network error", { cause });
      }
      if (!res.ok) throw new UsdaError(`USDA search failed: ${res.status}`);
      const body = searchResponse.safeParse(await res.json().catch(() => null));
      if (!body.success) {
        throw new UsdaError("USDA search failed: unexpected response");
      }
      return body.data.foods.map((f) => ({
        fdcId: f.fdcId,
        description: f.description,
        dataType: f.dataType,
        foodNutrients: f.foodNutrients.map(({ nutrientId, value }) => ({
          nutrientId,
          value,
        })),
      }));
    },
  };
}
