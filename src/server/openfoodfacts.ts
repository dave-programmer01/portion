/**
 * Open Food Facts client — barcode lookup + text search. OFF is free but asks
 * for a descriptive User-Agent. We normalise everything to per-100g macros so
 * the rest of the app has one shape (see `foodMaster`).
 */

const UA = "Portion/1.0 (calorie tracker; contact: support@portion.app)";
const BASE = "https://world.openfoodfacts.org";

export type OffProduct = {
  barcode: string | null;
  name: string;
  brand: string | null;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultServingG: number | null;
  servingLabel: string | null;
};

type RawProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
};

function num(v: number | string | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function normalise(p: RawProduct): OffProduct | null {
  const n = p.nutriments ?? {};
  const name = p.product_name?.trim();
  const calories = num(n["energy-kcal_100g"]);
  // Skip rows with no usable name or energy data — not worth caching/showing.
  if (!name || calories <= 0) return null;

  return {
    barcode: p.code ?? null,
    name,
    brand: p.brands?.split(",")[0]?.trim() ?? null,
    caloriesPer100: calories,
    proteinPer100: num(n["proteins_100g"]),
    carbsPer100: num(n["carbohydrates_100g"]),
    fatPer100: num(n["fat_100g"]),
    defaultServingG: p.serving_quantity ? num(p.serving_quantity) : null,
    servingLabel: p.serving_size ?? null,
  };
}

/** Look up a single product by barcode. Returns null if unknown/unusable. */
export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const fields =
    "code,product_name,brands,serving_quantity,serving_size,nutriments";
  const res = await fetch(
    `${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: number; product?: RawProduct };
  if (data.status !== 1 || !data.product) return null;
  return normalise({ ...data.product, code: barcode });
}

/** Free-text search. Returns up to `limit` usable products. */
export async function searchProducts(
  query: string,
  limit = 20,
): Promise<OffProduct[]> {
  const params = new URLSearchParams({
    search_terms: query,
    json: "1",
    page_size: String(limit),
    fields: "code,product_name,brands,serving_quantity,serving_size,nutriments",
  });
  const res = await fetch(`${BASE}/cgi/search.pl?${params.toString()}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { products?: RawProduct[] };
  return (data.products ?? [])
    .map(normalise)
    .filter((p): p is OffProduct => p !== null)
    .slice(0, limit);
}
