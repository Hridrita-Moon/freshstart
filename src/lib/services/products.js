import { prisma } from "@/lib/prisma";
import { ERROR_CODES, apiError } from "@/lib/errors";
import { computeDecayPrice } from "@/lib/decay";

/**
 * Product catalogue service.
 *
 * SRS §6.4.2 and the `product-batch-lifecycle` spec:
 * - `GET /api/products` — list active products.
 * - `GET /api/products/:id` — product detail.
 * - `GET /api/products/:id/available-batches` — listed batches with the
 *   current freshness tier and price.
 * - `POST /api/products` — create (admin).
 * - `PATCH /api/products/:id` — update (admin).
 * - `DELETE /api/products/:id` — soft delete, `isActive = false` (admin).
 *
 * Two rules shape this module:
 * 1. A deactivated product disappears from customer-facing listings, but
 *    batches referencing it stay intact and readable.
 * 2. The price shown for a batch is always recomputed from the decay
 *    function. The persisted `currentTier` / `currentPriceMultiplier` on a
 *    batch are a cache for the scheduled job, not the source of truth
 *    (SRS §4.5, §5.4).
 */

/**
 * List products.
 *
 * @param {object} [options]
 * @param {string} [options.category] filter by category
 * @param {boolean} [options.includeInactive] include soft-deleted products (admin views)
 * @returns {Promise<import("@prisma/client").Product[]>}
 */
export async function listProducts({ category, includeInactive = false } = {}) {
  const where = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(category ? { category } : {}),
  };

  return prisma.product.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

/**
 * Fetch a single product by id.
 *
 * @param {string} id
 * @param {object} [options]
 * @param {boolean} [options.includeInactive]
 * @returns {Promise<import("@prisma/client").Product>}
 */
export async function getProductById(id, { includeInactive = false } = {}) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw apiError(ERROR_CODES.NOT_FOUND, "Product not found.");
  }
  if (!product.isActive && !includeInactive) {
    throw apiError(ERROR_CODES.NOT_FOUND, "Product not found.");
  }
  return product;
}

/**
 * Create a product.
 *
 * A duplicate SKU is rejected with a conflict error. The database's unique
 * index on `sku` is the real guarantee — this pre-check exists only to
 * return a clean error message, and the `P2002` handler in `errors.js`
 * catches the race.
 *
 * @param {import("@/lib/validation/product").ProductInput} input
 * @returns {Promise<import("@prisma/client").Product>}
 */
export async function createProduct(input) {
  const existing = await prisma.product.findUnique({
    where: { sku: input.sku },
    select: { id: true },
  });

  if (existing) {
    throw apiError(ERROR_CODES.CONFLICT, `A product with SKU "${input.sku}" already exists.`, {
      sku: input.sku,
    });
  }

  return prisma.product.create({
    data: {
      sku: input.sku,
      name: input.name,
      category: input.category,
      defaultUnit: input.defaultUnit,
      baseUnitPrice: input.baseUnitPrice,
      imageUrl: input.imageUrl ?? null,
      description: input.description ?? null,
      originDistrict: input.originDistrict ?? null,
      harvestToShelfDays: input.harvestToShelfDays,
      isActive: input.isActive,
    },
  });
}

/**
 * Update a product. Only the supplied fields are changed.
 *
 * @param {string} id
 * @param {Partial<import("@/lib/validation/product").ProductInput>} patch
 * @returns {Promise<import("@prisma/client").Product>}
 */
export async function updateProduct(id, patch) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw apiError(ERROR_CODES.NOT_FOUND, "Product not found.");
  }

  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    data[key] = value;
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  return prisma.product.update({ where: { id }, data });
}

/**
 * Soft-delete a product.
 *
 * The product is marked inactive rather than removed, so existing batches
 * keep a valid reference and stay readable. The spec is explicit: "batches
 * already referencing it remain intact and readable".
 *
 * @param {string} id
 * @returns {Promise<import("@prisma/client").Product>}
 */
export async function deactivateProduct(id) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw apiError(ERROR_CODES.NOT_FOUND, "Product not found.");
  }

  return prisma.product.update({ where: { id }, data: { isActive: false } });
}

/**
 * List the batches of a product that are currently buyable, each with its
 * recomputed freshness tier and displayed price.
 *
 * Only `listed` batches qualify. A batch that has decayed past its shelf
 * life is still `listed` in the database until the scheduled job delists it,
 * so this method recomputes the tier and filters out `expired` batches —
 * otherwise a customer could be shown produce that is no longer sellable.
 *
 * @param {string} productId
 * @param {Date} [now]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function listAvailableBatches(productId, now = new Date()) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw apiError(ERROR_CODES.NOT_FOUND, "Product not found.");
  }

  const batches = await prisma.batch.findMany({
    where: {
      productId,
      status: "listed",
      availableQty: { gt: 0 },
    },
    include: {
      aggregator: { select: { id: true, name: true, companyName: true } },
    },
    orderBy: { harvestDate: "desc" },
  });

  const results = [];

  for (const batch of batches) {
    const decay = computeDecayPrice(batch.harvestDate, now, {
      baseUnitPrice: product.baseUnitPrice,
      harvestToShelfDays: product.harvestToShelfDays,
    });

    // Skip batches that have expired but have not yet been swept by the
    // scheduled job.
    if (decay.tier === "expired") continue;

    results.push({
      id: batch.id,
      batchCode: batch.batchCode,
      harvestDate: batch.harvestDate,
      originDistrict: batch.originDistrict,
      availableQty: batch.availableQty,
      tier: decay.tier,
      priceMultiplier: decay.multiplier,
      unitPrice: decay.unitPrice,
      baseUnitPrice: product.baseUnitPrice,
      action: decay.action,
      daysSinceHarvest: decay.daysSinceHarvest,
      remainingShelfDays: decay.remainingShelfDays,
      aggregator: batch.aggregator,
    });
  }

  return results;
}
