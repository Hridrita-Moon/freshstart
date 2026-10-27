/**
 * Tiny plain-JS validation toolkit.
 *
 * SRS §2.4: validators live in `src/lib/validation/` and return a
 * Zod-like result so that every call site reads the same way:
 *
 * ```js
 * const result = validateProductInput(body);
 * if (!result.success) return validationError(result.errors);
 * const { sku, name } = result.data;
 * ```
 *
 * There is no schema DSL — the composed validators below are plain
 * functions that accumulate issues and return them together.
 */

/**
 * @typedef {{ path: string, message: string }} ValidationIssue
 * @typedef {{ success: true, data: any } | { success: false, errors: ValidationIssue[] }} ValidationResult
 */

/**
 * Accumulates issues while a validator runs.
 */
export class Validator {
  constructor() {
    /** @type {ValidationIssue[]} */
    this.issues = [];
  }

  /**
   * @param {string} path
   * @param {string} message
   */
  add(path, message) {
    this.issues.push({ path, message });
    return this;
  }

  /**
   * Record an issue only if the value failed a check.
   * @param {unknown} value
   * @param {boolean} ok
   * @param {string} path
   * @param {string} message
   */
  check(value, ok, path, message) {
    if (!ok) this.add(path, message);
    return ok;
  }

  /** @returns {boolean} */
  get failed() {
    return this.issues.length > 0;
  }
}

/**
 * @param {Validator} validator
 * @param {Record<string, any>} data
 * @returns {ValidationResult}
 */
export function finish(validator, data) {
  if (validator.failed) {
    return { success: false, errors: validator.issues };
  }
  return { success: true, data };
}

// ─── Primitives ─────────────────────────────────────────────────────────────

/**
 * @param {Validator} v
 * @param {unknown} value
 * @param {string} path
 * @param {{ min?: number, max?: number }} [opts]
 * @returns {string | undefined}
 */
export function requireString(v, value, path, opts = {}) {
  const { min = 1, max = 255 } = opts;
  if (typeof value !== "string") {
    v.add(path, "Must be a string.");
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    v.add(path, `Must be at least ${min} character${min === 1 ? "" : "s"}.`);
    return undefined;
  }
  if (trimmed.length > max) {
    v.add(path, `Must be at most ${max} characters.`);
    return undefined;
  }
  return trimmed;
}

/**
 * @param {Validator} v
 * @param {unknown} value
 * @param {string} path
 * @param {{ min?: number, max?: number }} [opts]
 * @returns {number | undefined}
 */
export function requireInt(v, value, path, opts = {}) {
  const { min, max } = opts;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    v.add(path, "Must be an integer.");
    return undefined;
  }
  if (min !== undefined && value < min) {
    v.add(path, `Must be at least ${min}.`);
    return undefined;
  }
  if (max !== undefined && value > max) {
    v.add(path, `Must be at most ${max}.`);
    return undefined;
  }
  return value;
}

/**
 * @param {Validator} v
 * @param {unknown} value
 * @param {string} path
 * @param {{ min?: number, max?: number }} [opts]
 * @returns {number | undefined}
 */
export function requireNumber(v, value, path, opts = {}) {
  const { min, max } = opts;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    v.add(path, "Must be a number.");
    return undefined;
  }
  if (min !== undefined && value < min) {
    v.add(path, `Must be at least ${min}.`);
    return undefined;
  }
  if (max !== undefined && value > max) {
    v.add(path, `Must be at most ${max}.`);
    return undefined;
  }
  return value;
}

/**
 * @param {Validator} v
 * @param {unknown} value
 * @param {string} path
 * @param {readonly string[]} allowlist
 * @returns {string | undefined}
 */
export function requireEnum(v, value, path, allowlist) {
  if (typeof value !== "string" || !allowlist.includes(value)) {
    v.add(path, `Must be one of: ${allowlist.join(", ")}.`);
    return undefined;
  }
  return value;
}

/**
 * @param {Validator} v
 * @param {unknown} value
 * @param {string} path
 * @param {number} max
 * @returns {string | undefined}
 */
export function requireBoolean(v, value, path, max = 255) {
  if (typeof value !== "boolean") {
    v.add(path, "Must be a boolean.");
    return undefined;
  }
  return value;
}

/**
 * @param {Validator} v
 * @param {unknown} value
 * @param {string} path
 * @returns {string | undefined}
 */
export function optionalString(v, value, path, max = 255) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    v.add(path, "Must be a string.");
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) {
    v.add(path, `Must be at most ${max} characters.`);
    return undefined;
  }
  return trimmed;
}

/**
 * Coerce a value that may arrive as a query string into a number.
 *
 * Query parameters are always strings, so `?limit=20` must become `20`.
 *
 * @param {Validator} v
 * @param {unknown} value
 * @param {string} path
 * @param {{ min?: number, max?: number, fallback?: number }} opts
 * @returns {number}
 */
export function coerceInt(v, value, path, opts = {}) {
  const { min, max, fallback } = opts;
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    v.add(path, "Is required.");
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    v.add(path, "Must be an integer.");
    return fallback ?? 0;
  }
  if (min !== undefined && parsed < min) {
    v.add(path, `Must be at least ${min}.`);
    return fallback ?? 0;
  }
  if (max !== undefined && parsed > max) {
    v.add(path, `Must be at most ${max}.`);
    return fallback ?? 0;
  }
  return parsed;
}
