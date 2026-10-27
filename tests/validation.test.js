import { describe, it, expect } from "vitest";
import { validateProductInput, validateProductUpdate } from "@/lib/validation/product";

const VALID = {
  sku: "FR-MNG-ALPHONSO",
  name: "Alphonso Mango",
  category: "fruit",
  defaultUnit: "kg",
  baseUnitPrice: 220,
  harvestToShelfDays: 7,
};

/**
 * @param {import("@/lib/validation/schema").ValidationIssue[]} errors
 * @param {string} path
 * @returns {boolean}
 */
function hasIssue(errors, path) {
  return errors.some((e) => e.path === path);
}

describe("validateProductInput", () => {
  it("accepts a valid product", () => {
    const result = validateProductInput(VALID);
    expect(result.success).toBe(true);
    expect(result.data.sku).toBe("FR-MNG-ALPHONSO");
    expect(result.data.baseUnitPrice).toBe(220);
  });

  it("applies documented defaults", () => {
    const result = validateProductInput({
      ...VALID,
      harvestToShelfDays: undefined,
      isActive: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.data.harvestToShelfDays).toBe(5);
    expect(result.data.isActive).toBe(true);
  });

  it("trims whitespace from strings", () => {
    const result = validateProductInput({ ...VALID, name: "  Alphonso Mango  " });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("Alphonso Mango");
  });

  it("rejects a missing SKU", () => {
    const result = validateProductInput({ ...VALID, sku: undefined });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "sku")).toBe(true);
  });

  it("rejects a SKU with illegal characters", () => {
    const result = validateProductInput({ ...VALID, sku: "bad sku!" });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "sku")).toBe(true);
  });

  it("rejects an unknown category", () => {
    const result = validateProductInput({ ...VALID, category: "dairy" });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "category")).toBe(true);
  });

  it("rejects an unknown unit", () => {
    const result = validateProductInput({ ...VALID, defaultUnit: "crate" });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "defaultUnit")).toBe(true);
  });

  it("rejects a non-integer price", () => {
    const result = validateProductInput({ ...VALID, baseUnitPrice: 220.5 });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "baseUnitPrice")).toBe(true);
  });

  it("rejects a zero or negative price", () => {
    expect(validateProductInput({ ...VALID, baseUnitPrice: 0 }).success).toBe(false);
    expect(validateProductInput({ ...VALID, baseUnitPrice: -10 }).success).toBe(false);
  });

  it("rejects a non-positive shelf life", () => {
    const result = validateProductInput({ ...VALID, harvestToShelfDays: 0 });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "harvestToShelfDays")).toBe(true);
  });

  it("reports every invalid field at once", () => {
    const result = validateProductInput({
      sku: "",
      name: "",
      category: "dairy",
      defaultUnit: "crate",
      baseUnitPrice: -1,
    });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it("handles a null body without throwing", () => {
    const result = validateProductInput(null);
    expect(result.success).toBe(false);
  });
});

describe("validateProductUpdate", () => {
  it("accepts a partial update", () => {
    const result = validateProductUpdate({ baseUnitPrice: 250 });
    expect(result.success).toBe(true);
    expect(result.data.baseUnitPrice).toBe(250);
  });

  it("accepts several fields at once", () => {
    const result = validateProductUpdate({ name: "New Name", isActive: false });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("New Name");
    expect(result.data.isActive).toBe(false);
  });

  it("rejects an empty update", () => {
    const result = validateProductUpdate({});
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "body")).toBe(true);
  });

  it("rejects an invalid value for a provided field", () => {
    const result = validateProductUpdate({ category: "dairy" });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "category")).toBe(true);
  });

  it("ignores fields that are not present", () => {
    const result = validateProductUpdate({ name: "Kept" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("category");
    expect(result.data).not.toHaveProperty("baseUnitPrice");
  });

  it("does not allow the SKU to be changed", () => {
    const result = validateProductUpdate({ sku: "NEW-SKU" });
    expect(result.success).toBe(false);
  });
});
