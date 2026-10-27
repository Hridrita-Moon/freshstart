import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createProduct,
  deactivateProduct,
  getProductById,
  listAvailableBatches,
  listProducts,
  updateProduct,
} from "@/lib/services/products";
import { validateProductInput } from "@/lib/validation/product";

/**
 * Integration tests for the product catalogue service.
 *
 * SRS §14.1: these run against a dedicated `dev.test.db` SQLite file with
 * migrations applied in `beforeAll`.
 */

const DAY_MS = 86_400_000;

/**
 * Midnight Dhaka time, `daysAgo` days before now.
 * @param {number} daysAgo
 * @returns {Date}
 */
function daysAgoDhakaMidnight(daysAgo) {
  const now = new Date();
  const shifted = new Date(now.getTime() + 6 * 3_600_000);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightUtc - 6 * 3_600_000 - daysAgo * DAY_MS);
}

let admin;
let aggregator;
let product;

beforeAll(async () => {
  admin = await prisma.user.create({
    data: {
      email: "admin.products@test.local",
      passwordHash: "x",
      name: "Admin",
      role: "admin",
    },
  });

  aggregator = await prisma.user.create({
    data: {
      email: "agg.products@test.local",
      passwordHash: "x",
      name: "Aggregator",
      role: "aggregator",
      companyName: "Test Farms",
      districts: JSON.stringify(["Dhaka"]),
    },
  });
});

afterAll(async () => {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.batchQcLog.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.batch.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany({
    where: { email: { in: ["admin.products@test.local", "agg.products@test.local"] } },
  });

  admin = await prisma.user.create({
    data: { email: "admin.products@test.local", passwordHash: "x", name: "Admin", role: "admin" },
  });
  aggregator = await prisma.user.create({
    data: {
      email: "agg.products@test.local",
      passwordHash: "x",
      name: "Aggregator",
      role: "aggregator",
      companyName: "Test Farms",
      districts: JSON.stringify(["Dhaka"]),
    },
  });

  const result = validateProductInput({
    sku: "FR-TEST-MANGO",
    name: "Test Mango",
    category: "fruit",
    defaultUnit: "kg",
    baseUnitPrice: 200,
    harvestToShelfDays: 7,
  });
  expect(result.success).toBe(true);
  product = await createProduct(result.data);
});

describe("createProduct", () => {
  it("stores the product with an integer BDT price", async () => {
    const created = await prisma.product.findUnique({ where: { sku: "FR-TEST-MANGO" } });
    expect(created).not.toBeNull();
    expect(created.baseUnitPrice).toBe(200);
    expect(Number.isInteger(created.baseUnitPrice)).toBe(true);
  });

  it("makes the product immediately available to batch creation", async () => {
    const batch = await prisma.batch.create({
      data: {
        productId: product.id,
        aggregatorId: aggregator.id,
        batchCode: "FT-TST-2026-10-09-1",
        qrSlug: "slug-available-1",
        harvestDate: daysAgoDhakaMidnight(0),
        originDistrict: "Dhaka",
        inboundQty: 10,
        availableQty: 10,
        status: "in_transit",
        qcStatus: "pending",
      },
    });
    expect(batch.productId).toBe(product.id);
  });

  it("rejects a duplicate SKU with a conflict error", async () => {
    const result = validateProductInput({
      sku: "FR-TEST-MANGO",
      name: "Duplicate",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 100,
      harvestToShelfDays: 5,
    });
    expect(result.success).toBe(true);

    await expect(createProduct(result.data)).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
  });

  it("does not overwrite the existing product on a duplicate SKU", async () => {
    const original = await prisma.product.findUnique({ where: { sku: "FR-TEST-MANGO" } });

    const result = validateProductInput({
      sku: "FR-TEST-MANGO",
      name: "Impostor",
      category: "vegetable",
      defaultUnit: "piece",
      baseUnitPrice: 999,
      harvestToShelfDays: 5,
    });
    await createProduct(result.data).catch(() => {});

    const after = await prisma.product.findUnique({ where: { sku: "FR-TEST-MANGO" } });
    expect(after.name).toBe(original.name);
    expect(after.baseUnitPrice).toBe(original.baseUnitPrice);
  });
});

describe("listProducts", () => {
  it("excludes inactive products by default", async () => {
    await deactivateProduct(product.id);
    const products = await listProducts();
    expect(products.find((p) => p.id === product.id)).toBeUndefined();
  });

  it("includes inactive products when asked", async () => {
    await deactivateProduct(product.id);
    const products = await listProducts({ includeInactive: true });
    expect(products.find((p) => p.id === product.id)).toBeDefined();
  });

  it("filters by category", async () => {
    await createProduct({
      sku: "FR-TEST-TOMATO",
      name: "Test Tomato",
      category: "vegetable",
      defaultUnit: "kg",
      baseUnitPrice: 60,
      harvestToShelfDays: 5,
      isActive: true,
    });

    const vegetables = await listProducts({ category: "vegetable" });
    expect(vegetables).toHaveLength(1);
    expect(vegetables[0].category).toBe("vegetable");
  });
});

describe("getProductById", () => {
  it("returns the product", async () => {
    const found = await getProductById(product.id);
    expect(found.sku).toBe("FR-TEST-MANGO");
  });

  it("throws not_found for an unknown id", async () => {
    await expect(getProductById("does-not-exist")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("hides an inactive product from non-admin callers", async () => {
    await deactivateProduct(product.id);
    await expect(getProductById(product.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("shows an inactive product to admins", async () => {
    await deactivateProduct(product.id);
    const found = await getProductById(product.id, { includeInactive: true });
    expect(found.isActive).toBe(false);
  });
});

describe("updateProduct", () => {
  it("updates only the supplied fields", async () => {
    const updated = await updateProduct(product.id, { baseUnitPrice: 250 });
    expect(updated.baseUnitPrice).toBe(250);
    expect(updated.name).toBe("Test Mango");
  });

  it("throws not_found for an unknown id", async () => {
    await expect(updateProduct("missing", { name: "X" })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("deactivateProduct", () => {
  it("marks the product inactive rather than deleting it", async () => {
    const deactivated = await deactivateProduct(product.id);
    expect(deactivated.isActive).toBe(false);

    const still = await prisma.product.findUnique({ where: { id: product.id } });
    expect(still).not.toBeNull();
  });

  it("leaves existing batches intact and readable", async () => {
    const batch = await prisma.batch.create({
      data: {
        productId: product.id,
        aggregatorId: aggregator.id,
        batchCode: "FT-TST-2026-10-09-2",
        qrSlug: "slug-intact-1",
        harvestDate: daysAgoDhakaMidnight(0),
        originDistrict: "Dhaka",
        inboundQty: 10,
        availableQty: 10,
        status: "listed",
        qcStatus: "passed",
      },
    });

    await deactivateProduct(product.id);

    const reloaded = await prisma.batch.findUnique({
      where: { id: batch.id },
      include: { product: true },
    });
    expect(reloaded).not.toBeNull();
    expect(reloaded.product.sku).toBe("FR-TEST-MANGO");
  });

  it("is idempotent", async () => {
    await deactivateProduct(product.id);
    const again = await deactivateProduct(product.id);
    expect(again.isActive).toBe(false);
  });
});

describe("listAvailableBatches", () => {
  /**
   * @param {object} overrides
   * @returns {Promise<import("@prisma/client").Batch>}
   */
  async function makeBatch(overrides = {}) {
    return prisma.batch.create({
      data: {
        productId: product.id,
        aggregatorId: aggregator.id,
        batchCode: overrides.batchCode ?? "FT-TST-2026-10-09-3",
        qrSlug: overrides.qrSlug ?? `slug-${Math.random().toString(36).slice(2)}`,
        harvestDate: overrides.harvestDate ?? daysAgoDhakaMidnight(0),
        originDistrict: "Dhaka",
        inboundQty: 100,
        availableQty: overrides.availableQty ?? 50,
        status: overrides.status ?? "listed",
        qcStatus: overrides.qcStatus ?? "passed",
        currentTier: overrides.currentTier ?? "fresh",
        currentPriceMultiplier: overrides.currentPriceMultiplier ?? 1.0,
      },
    });
  }

  it("returns only listed batches with stock remaining", async () => {
    await makeBatch({ batchCode: "FT-A-1", qrSlug: "s-a-1", status: "listed" });
    await makeBatch({ batchCode: "FT-B-1", qrSlug: "s-b-1", status: "in_transit" });
    await makeBatch({ batchCode: "FT-C-1", qrSlug: "s-c-1", status: "delisted" });
    await makeBatch({ batchCode: "FT-D-1", qrSlug: "s-d-1", status: "listed", availableQty: 0 });

    const batches = await listAvailableBatches(product.id);
    expect(batches).toHaveLength(1);
    expect(batches[0].batchCode).toBe("FT-A-1");
  });

  it("recomputes the tier rather than trusting the stored value", async () => {
    // Stored tier says "fresh", but the harvest date puts it in the "good" band.
    await makeBatch({
      batchCode: "FT-STALE-1",
      qrSlug: "s-stale-1",
      harvestDate: daysAgoDhakaMidnight(3),
      currentTier: "fresh",
      currentPriceMultiplier: 1.0,
    });

    const [batch] = await listAvailableBatches(product.id);
    expect(batch.tier).toBe("good");
    expect(batch.priceMultiplier).toBe(0.8);
    expect(batch.unitPrice).toBe(160); // 200 * 0.8
  });

  it("applies the tier discount to the displayed price", async () => {
    await makeBatch({
      batchCode: "FT-FAIR-1",
      qrSlug: "s-fair-1",
      harvestDate: daysAgoDhakaMidnight(5),
    });

    const [batch] = await listAvailableBatches(product.id);
    expect(batch.tier).toBe("fair");
    expect(batch.unitPrice).toBe(120); // 200 * 0.6
    expect(batch.baseUnitPrice).toBe(200);
  });

  it("hides a batch that has expired but not yet been swept by the job", async () => {
    await makeBatch({
      batchCode: "FT-EXPIRED-1",
      qrSlug: "s-expired-1",
      harvestDate: daysAgoDhakaMidnight(30),
      status: "listed",
    });

    const batches = await listAvailableBatches(product.id);
    expect(batches).toHaveLength(0);
  });

  it("throws not_found for an unknown product", async () => {
    await expect(listAvailableBatches("missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("includes the aggregator identity", async () => {
    await makeBatch({ batchCode: "FT-AGG-1", qrSlug: "s-agg-1" });
    const [batch] = await listAvailableBatches(product.id);
    expect(batch.aggregator.id).toBe(aggregator.id);
  });
});
