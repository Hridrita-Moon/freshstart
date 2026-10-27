import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "@/lib/constants";
import {
  Validator,
  finish,
  optionalString,
  requireEnum,
  requireInt,
  requireString,
} from "@/lib/validation/schema";

/**
 * Product input validation.
 *
 * Rules come from the `product-batch-lifecycle` spec ("Product Catalogue")
 * and SRS §4.4:
 * - `sku` is required and unique (uniqueness is enforced by the DB).
 * - `name` is required.
 * - `category` must be one of fruit | vegetable | other.
 * - `defaultUnit` must be one of kg | piece | bunch.
 * - `baseUnitPrice` is an integer number of BDT, strictly positive.
 * - `harvestToShelfDays` is an integer number of days, strictly positive.
 */

/**
 * @typedef {object} ProductInput
 * @property {string} sku
 * @property {string} name
 * @property {string} category
 * @property {string} defaultUnit
 * @property {number} baseUnitPrice
 * @property {string} [imageUrl]
 * @property {string} [description]
 * @property {string} [originDistrict]
 * @property {number} harvestToShelfDays
 * @property {boolean} isActive
 */

/**
 * Validate a full product creation payload.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult<ProductInput>}
 */
export function validateProductInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  const sku = requireString(v, input.sku, "sku", { min: 2, max: 64 });
  if (sku !== undefined && !/^[A-Za-z0-9._-]+$/.test(sku)) {
    v.add("sku", "May only contain letters, numbers, dots, dashes and underscores.");
  }

  const name = requireString(v, input.name, "name", { min: 2, max: 120 });
  const category = requireEnum(v, input.category, "category", PRODUCT_CATEGORIES);
  const defaultUnit = requireEnum(v, input.defaultUnit, "defaultUnit", PRODUCT_UNITS);
  const baseUnitPrice = requireInt(v, input.baseUnitPrice, "baseUnitPrice", { min: 1 });

  const imageUrl = optionalString(v, input.imageUrl, "imageUrl", 500);
  const description = optionalString(v, input.description, "description", 2000);
  const originDistrict = optionalString(v, input.originDistrict, "originDistrict", 100);

  // Shelf life: the decay engine's input for when `near_expiry` becomes
  // `expired`. A product must live at least a day.
  const harvestToShelfDays =
    input.harvestToShelfDays === undefined
      ? 5
      : requireInt(v, input.harvestToShelfDays, "harvestToShelfDays", { min: 1, max: 60 });

  const isActive = input.isActive === undefined ? true : input.isActive !== false;

  return finish(v, {
    sku,
    name,
    category,
    defaultUnit,
    baseUnitPrice,
    imageUrl,
    description,
    originDistrict,
    harvestToShelfDays,
    isActive,
  });
}

/**
 * Validate a partial product update. Only the provided fields are checked;
 * `sku` is intentionally immutable because it is printed on labels and
 * referenced by aggregators' paperwork.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult<Partial<ProductInput>>}
 */
export function validateProductUpdate(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  /** @type {Partial<ProductInput>} */
  const data = {};

  if (input.name !== undefined) {
    data.name = requireString(v, input.name, "name", { min: 2, max: 120 });
  }
  if (input.category !== undefined) {
    data.category = requireEnum(v, input.category, "category", PRODUCT_CATEGORIES);
  }
  if (input.defaultUnit !== undefined) {
    data.defaultUnit = requireEnum(v, input.defaultUnit, "defaultUnit", PRODUCT_UNITS);
  }
  if (input.baseUnitPrice !== undefined) {
    data.baseUnitPrice = requireInt(v, input.baseUnitPrice, "baseUnitPrice", { min: 1 });
  }
  if (input.harvestToShelfDays !== undefined) {
    data.harvestToShelfDays = requireInt(v, input.harvestToShelfDays, "harvestToShelfDays", {
      min: 1,
      max: 60,
    });
  }
  if (input.imageUrl !== undefined) {
    data.imageUrl = optionalString(v, input.imageUrl, "imageUrl", 500);
  }
  if (input.description !== undefined) {
    data.description = optionalString(v, input.description, "description", 2000);
  }
  if (input.originDistrict !== undefined) {
    data.originDistrict = optionalString(v, input.originDistrict, "originDistrict", 100);
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") {
      v.add("isActive", "Must be a boolean.");
    } else {
      data.isActive = input.isActive;
    }
  }

  if (Object.keys(data).length === 0 && !v.failed) {
    v.add("body", "Must contain at least one field to update.");
  }

  return finish(v, data);
}
