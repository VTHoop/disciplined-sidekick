import { describe, expect, it } from "vitest";
import {
  createUsdaClient,
  USDA_BRANDED_DATA_TYPES,
  USDA_BRANDED_PAGE_SIZE,
  USDA_DATA_TYPES,
  USDA_PAGE_SIZE,
  USDA_SEARCH_URL,
  UsdaError,
} from "./usda";

const KEY = "test-api-data-gov-key";

const blueberries = {
  fdcId: 2346411,
  description: "Blueberries, raw",
  dataType: "Foundation",
  foodNutrients: [
    { nutrientId: 1003, nutrientName: "Protein", unitName: "G", value: 0.7 },
    { nutrientId: 2047, nutrientName: "Energy", unitName: "KCAL", value: 64 },
    { nutrientId: 1004, nutrientName: "Total fat", unitName: "G", value: 0.3 },
  ],
};

function stubFetch(
  respond: () => Response | Promise<Response>,
): typeof fetch & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return respond();
  }) as typeof fetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("USDA FDC search", () => {
  it("searches Foundation, SR Legacy and FNDDS for the top results", async () => {
    const fetch = stubFetch(() => json({ foods: [blueberries] }));
    await createUsdaClient({ apiKey: KEY, fetch }).search("blueberries raw");

    expect(fetch.calls).toHaveLength(1);
    const { url, init } = fetch.calls[0] ?? { url: "", init: {} };
    expect(url).toBe(USDA_SEARCH_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      query: "blueberries raw",
      dataType: USDA_DATA_TYPES,
      pageSize: USDA_PAGE_SIZE,
    });
    expect(USDA_DATA_TYPES).toEqual([
      "Foundation",
      "SR Legacy",
      "Survey (FNDDS)",
    ]);
  });

  it("searches only the Branded dataset when asked to", async () => {
    const fetch = stubFetch(() => json({ foods: [] }));
    await createUsdaClient({ apiKey: KEY, fetch }).search(
      "Chobani plain greek yogurt",
      USDA_BRANDED_DATA_TYPES,
    );
    expect(USDA_BRANDED_DATA_TYPES).toEqual(["Branded"]);
    const { init } = fetch.calls[0] ?? { init: {} as RequestInit };
    expect(JSON.parse(String(init.body))).toEqual({
      query: "Chobani plain greek yogurt",
      dataType: ["Branded"],
      pageSize: USDA_PAGE_SIZE,
    });
  });

  it("asks for the page size it is given, so a branded search can look deeper", async () => {
    const fetch = stubFetch(() => json({ foods: [] }));
    await createUsdaClient({ apiKey: KEY, fetch }).search(
      "Rana lobster ravioli",
      USDA_BRANDED_DATA_TYPES,
      USDA_BRANDED_PAGE_SIZE,
    );
    const { init } = fetch.calls[0] ?? { init: {} as RequestInit };
    expect(JSON.parse(String(init.body)).pageSize).toBe(USDA_BRANDED_PAGE_SIZE);
    expect(USDA_BRANDED_PAGE_SIZE).toBeGreaterThan(USDA_PAGE_SIZE);
  });

  it("returns a branded food's brand owner, brand name and label serving size", async () => {
    const fetch = stubFetch(() =>
      json({
        foods: [
          {
            fdcId: 2755534,
            description: "Chobani Plain Low- Fat Greek Yogurt",
            dataType: "Branded",
            brandOwner: "",
            brandName: "Chobani",
            servingSize: 180,
            servingSizeUnit: "g",
            householdServingFullText: "",
            gtinUpc: "00894700010199",
            foodNutrients: [{ nutrientId: 1003, value: 9.44 }],
          },
        ],
      }),
    );
    await expect(
      createUsdaClient({ apiKey: KEY, fetch }).search(
        "chobani",
        USDA_BRANDED_DATA_TYPES,
      ),
    ).resolves.toEqual([
      {
        fdcId: 2755534,
        description: "Chobani Plain Low- Fat Greek Yogurt",
        dataType: "Branded",
        brandOwner: "",
        brandName: "Chobani",
        servingSize: 180,
        servingSizeUnit: "g",
        foodNutrients: [{ nutrientId: 1003, value: 9.44 }],
      },
    ]);
  });

  it("sends the key in the X-Api-Key header, never in the URL or body", async () => {
    const fetch = stubFetch(() => json({ foods: [] }));
    await createUsdaClient({ apiKey: KEY, fetch }).search("egg");

    const { url, init } = fetch.calls[0] ?? { url: "", init: {} };
    expect(new Headers(init.headers).get("X-Api-Key")).toBe(KEY);
    expect(url).not.toContain(KEY);
    expect(url).not.toMatch(/api_key/i);
    expect(String(init.body)).not.toContain(KEY);
  });

  it("returns each food's id, description, data type and per-100 g nutrients", async () => {
    const fetch = stubFetch(() => json({ foods: [blueberries] }));
    await expect(
      createUsdaClient({ apiKey: KEY, fetch }).search("blueberries"),
    ).resolves.toEqual([
      {
        fdcId: 2346411,
        description: "Blueberries, raw",
        dataType: "Foundation",
        foodNutrients: [
          { nutrientId: 1003, value: 0.7 },
          { nutrientId: 2047, value: 64 },
          { nutrientId: 1004, value: 0.3 },
        ],
      },
    ]);
  });

  it("treats a successful response with no foods as an empty result, not an error", async () => {
    const fetch = stubFetch(() => json({ totalHits: 0, foods: [] }));
    await expect(
      createUsdaClient({ apiKey: KEY, fetch }).search("zzzz"),
    ).resolves.toEqual([]);
  });

  it.each([
    ["a 500", () => json({ error: "boom" }, 500)],
    ["a 503", () => new Response("unavailable", { status: 503 })],
    ["a 429 (rate limited)", () => json({ error: "OVER_RATE_LIMIT" }, 429)],
    ["a 403 (bad key)", () => json({ error: "API_KEY_INVALID" }, 403)],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
    ["a body without a foods array", () => json({ hits: [] })],
  ])("throws UsdaError for %s", async (_, respond) => {
    const fetch = stubFetch(respond);
    await expect(
      createUsdaClient({ apiKey: KEY, fetch }).search("egg"),
    ).rejects.toBeInstanceOf(UsdaError);
  });

  it("throws UsdaError when the network fails", async () => {
    const fetch = stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(
      createUsdaClient({ apiKey: KEY, fetch }).search("egg"),
    ).rejects.toBeInstanceOf(UsdaError);
  });

  it("never puts the key in an error message", async () => {
    const fetch = stubFetch(() => json({ error: KEY }, 403));
    const error = await createUsdaClient({ apiKey: KEY, fetch })
      .search("egg")
      .catch((e: unknown) => e);
    expect(String((error as Error).message)).not.toContain(KEY);
  });
});
