/**
 * Domain constants.
 *
 * The Prisma schema stores enum-like fields as `String` because SQLite has no
 * native enum type (see `prisma/schema.prisma` header). These allowlists are
 * the application-level source of truth for the permitted values.
 */

// ─── Roles & users ──────────────────────────────────────────────────────────

export const ROLES = /** @type {const} */ (["customer", "aggregator", "qc_staff", "admin"]);

export const USER_STATUSES = /** @type {const} */ (["active", "suspended"]);

/** Roles that may be provisioned by an admin (a customer self-registers). */
export const PROVISIONABLE_ROLES = /** @type {const} */ (["aggregator", "qc_staff", "admin"]);

// ─── Catalogue ──────────────────────────────────────────────────────────────

export const PRODUCT_CATEGORIES = /** @type {const} */ (["fruit", "vegetable", "other"]);

export const PRODUCT_UNITS = /** @type {const} */ (["kg", "piece", "bunch"]);

// ─── Batches ────────────────────────────────────────────────────────────────

export const BATCH_STATUSES = /** @type {const} */ (["in_transit", "listed", "delisted", "sold_out"]);

export const QC_STATUSES = /** @type {const} */ (["pending", "passed", "failed"]);

export const FRESHNESS_TIERS = /** @type {const} */ ([
  "fresh",
  "good",
  "fair",
  "near_expiry",
  "expired",
]);

export const QC_GRADES = /** @type {const} */ (["A", "B", "C"]);

/**
 * The batch state machine (SRS §4.5).
 *
 * Only these transitions are permitted. A delisted batch is terminal — it
 * cannot be relisted, because relisting would resurrect expired produce.
 */
export const BATCH_TRANSITIONS = {
  in_transit: /** @type {const} */ (["listed", "delisted"]),
  listed: /** @type {const} */ (["delisted", "sold_out"]),
  delisted: /** @type {const} */ ([]),
  sold_out: /** @type {const} */ ([]),
};

// ─── Orders ─────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = /** @type {const} */ ([
  "pending_payment",
  "paid",
  "in_fulfillment",
  "in_transit",
  "delivered",
  "cancelled",
  "refunded",
]);

export const PAYMENT_STATUSES = /** @type {const} */ ([
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
]);

export const PAYMENT_METHODS = /** @type {const} */ (["card", "bkash", "nagad"]);

// ─── Subscriptions ──────────────────────────────────────────────────────────

export const BASKET_SIZES = /** @type {const} */ (["small", "medium", "large"]);

export const SUBSCRIPTION_STATUSES = /** @type {const} */ (["active", "paused", "ended"]);

// ─── Refunds ────────────────────────────────────────────────────────────────

export const REFUND_STATUSES = /** @type {const} */ (["requested", "approved", "rejected", "processed"]);

export const REFUND_REQUESTER_ROLES = /** @type {const} */ (["customer", "qc_staff", "admin"]);

// ─── Geo ────────────────────────────────────────────────────────────────────

export const DHAKA_DISTRICTS = /** @type {const} */ ([
  "Dhaka",
  "Gazipur",
  "Narsingdi",
  "Narayanganj",
  "Munshiganj",
  "Manikganj",
  "Tangail",
  "Rajshahi",
  "Bogura",
  "Sylhet",
  "Cumilla",
  "Chattogram",
  "Rangpur",
  "Khulna",
  "Mymensingh",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * @param {readonly string[]} allowlist
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAllowed(allowlist, value) {
  return typeof value === "string" && allowlist.includes(value);
}
