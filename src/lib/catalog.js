import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { listAvailableBatches } from "@/lib/services/products";
import { computeDecayPrice } from "@/lib/decay";

/**
 * Catalogue reads for the UI.
 *
 * SRS §9.3: Server Components read directly through the Prisma client
 * singleton — there is no internal HTTP call. This module wraps the queries
 * the catalogue pages need and is memoised per request with `React.cache`, so
 * a page that reads the same product twice performs one query.
 *
 * The API routes under `src/app/api/products/` expose the same data to
 * clients; both paths share the service layer in `src/lib/services/`, so the
 * UI and the API can never disagree about pricing.
 */

/**
 * List active products for the catalogue grid.
 *
 * @param {object} [options]
 * @param {string} [options.category]
 * @param {string} [options.search]
 * @returns {Promise<import("@prisma/client").Product[]>}
 */
export const getCatalogProducts = cache(async ({ category, search } = {}) => {
  const where = {
    isActive: true,
    ...(category && category !== "all" ? { category } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
            { sku: { contains: search } },
          ],
        }
      : {}),
  };

  return prisma.product.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
});

/**
 * Get a single active product by its SKU.
 *
 * The catalogue links use the SKU rather than the cuid because a SKU is
 * meaningful to a person (it is printed on labels and paperwork).
 *
 * @param {string} sku
 * @returns {Promise<import("@prisma/client").Product | null>}
 */
export const getProductBySku = cache(async (sku) => {
  return prisma.product.findFirst({
    where: { sku, isActive: true },
  });
});

/**
 * Get the available batches for a product, newest harvest first.
 *
 * Delegates to the service layer so the decay-pricing rules are identical
 * to the ones the API applies.
 *
 * @param {string} productId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export const getAvailableBatches = cache(async (productId) => {
  return listAvailableBatches(productId);
});

/**
 * The "best" batch for a product — the freshest one still available.
 *
 * The catalogue card shows this batch's tier and price. `near_expiry` stock
 * is deliberately not preferred: a shopper should see the best produce first,
 * not the most urgent.
 *
 * @param {string} productId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export const getBestBatch = cache(async (productId) => {
  const batches = await getAvailableBatches(productId);
  if (batches.length === 0) return null;

  const tierRank = { fresh: 0, good: 1, fair: 2, near_expiry: 3 };

  return batches.reduce((best, batch) => {
    const bestRank = tierRank[best.tier] ?? Number.MAX_SAFE_INTEGER;
    const batchRank = tierRank[batch.tier] ?? Number.MAX_SAFE_INTEGER;

    // Prefer a fresher tier; break ties with the larger quantity in stock.
    if (batchRank < bestRank) return batch;
    if (batchRank === bestRank && batch.availableQty > best.availableQty) {
      return batch;
    }
    return best;
  }, batches[0]);
});

/**
 * Counts per category, for the catalogue filter chips.
 *
 * @returns {Promise<Array<{ category: string, count: number }>>}
 */
export const getCategoryCounts = cache(async () => {
  const grouped = await prisma.product.groupBy({
    by: ["category"],
    where: { isActive: true },
    _count: { category: true },
  });

  const counts = new Map(
    grouped.map((row) => [row.category, row._count.category]),
  );

  // Always show all three categories so the filter bar does not shift as
  // products are added.
  return [
    { category: "fruit", count: counts.get("fruit") ?? 0 },
    { category: "vegetable", count: counts.get("vegetable") ?? 0 },
    { category: "other", count: counts.get("other") ?? 0 },
  ];
});

/**
 * The cheapest currently available price for a product, used on the detail
 * page's "from" price.
 *
 * @param {string} productId
 * @returns {Promise<number | null>}
 */
export const getLowestPrice = cache(async (productId) => {
  const batches = await getAvailableBatches(productId);
  if (batches.length === 0) return null;
  return Math.min(...batches.map((b) => b.unitPrice));
});

/**
 * The tier a batch would have at a given moment — used by the detail page's
 * freshness explainer.
 *
 * @param {Date} harvestDate
 * @param {number} harvestToShelfDays
 * @param {Date} [now]
 * @returns {import("@/lib/decay").Tier}
 */
export function currentTier(harvestDate, harvestToShelfDays, now = new Date()) {
  return computeDecayPrice(harvestDate, now, {
    baseUnitPrice: 0,
    harvestToShelfDays,
  }).tier;
}
