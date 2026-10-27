/**
 * Freshness tier presentation.
 *
 * The tier names and multipliers come from the decay engine (SRS §5.1). This
 * module owns only the *presentation* of a tier — the label a customer sees
 * and the colour it is drawn in — so that the UI and the pricing logic cannot
 * drift apart.
 *
 * A tier is a product of the shelf life and the number of days since
 * harvest, so the same product can be `fresh` today and `near_expiry` in a
 * few days. Customers see the tier of the batch they are actually buying.
 */

/**
 * @typedef {'fresh' | 'good' | 'fair' | 'near_expiry' | 'expired'} Tier
 */

/**
 * @typedef {object} TierPresentation
 * @property {string} label        short label for a badge
 * @property {string} description  one-line explanation for customers
 * @property {string} dotClass     background colour of the status dot
 * @property {string} badgeClass   Tailwind classes for the badge
 * @property {string} accentClass  Tailwind classes for accent text/borders
 */

/**
 * Presentation for each freshness tier.
 *
 * The colours are deliberately a green → amber → orange progression so the
 * scale reads at a glance without relying on the label alone.
 *
 * @type {Record<Tier, TierPresentation>}
 */
export const TIER_PRESENTATION = {
  fresh: {
    label: "Fresh",
    description: "Just harvested — at its best.",
    dotClass: "bg-fresh-500",
    badgeClass: "bg-fresh-50 text-fresh-800 ring-fresh-600/20",
    accentClass: "text-fresh-700",
  },
  good: {
    label: "Good",
    description: "A couple of days old — still excellent.",
    dotClass: "bg-good-500",
    badgeClass: "bg-good-50 text-good-800 ring-good-600/20",
    accentClass: "text-good-700",
  },
  fair: {
    label: "Fair",
    description: "Past its peak, but perfectly good value.",
    dotClass: "bg-fair-500",
    badgeClass: "bg-fair-50 text-fair-800 ring-fair-600/20",
    accentClass: "text-fair-700",
  },
  near_expiry: {
    label: "Near expiry",
    description: "Best eaten soon — heavily discounted.",
    dotClass: "bg-near-expiry-500",
    badgeClass: "bg-near-expiry-50 text-near-expiry-800 ring-near-expiry-600/20",
    accentClass: "text-near-expiry-700",
  },
  expired: {
    label: "Expired",
    description: "Past its shelf life — no longer sold.",
    dotClass: "bg-expired-500",
    badgeClass: "bg-expired-50 text-expired-800 ring-expired-600/20",
    accentClass: "text-expired-700",
  },
};

/**
 * Fallback for an unrecognised tier.
 * @type {TierPresentation}
 */
const UNKNOWN_TIER = {
  label: "Unknown",
  description: "Freshness could not be determined.",
  dotClass: "bg-sand-400",
  badgeClass: "bg-sand-100 text-sand-700 ring-sand-500/20",
  accentClass: "text-sand-600",
};

/**
 * Get the presentation for a tier.
 *
 * @param {string | null | undefined} tier
 * @returns {TierPresentation}
 */
export function getTierPresentation(tier) {
  if (typeof tier === "string" && tier in TIER_PRESENTATION) {
    return TIER_PRESENTATION[tier];
  }
  return UNKNOWN_TIER;
}

/**
 * Human-readable category label.
 *
 * @param {string | null | undefined} category
 * @returns {string}
 */
export function getCategoryLabel(category) {
  switch (category) {
    case "fruit":
      return "Fruit";
    case "vegetable":
      return "Vegetable";
    case "other":
      return "Herbs & other";
    default:
      return "Produce";
  }
}

/**
 * Format a price in BDT.
 *
 * SRS §9.5 requires `Intl.NumberFormat` with the `BDT` currency. English
 * (`en-BD`) is used here; the locale is centralised so it can be switched to
 * `bn-BD` when the i18n layer lands.
 *
 * @param {number} amount
 * @returns {string}
 */
export function formatBDT(amount) {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a number with up to two decimals, trimming trailing zeros.
 *
 * Quantities are fractional (kg can be 2.5).
 *
 * @param {number} amount
 * @returns {string}
 */
export function formatQty(amount) {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date in the app timezone (Asia/Dhaka).
 *
 * SRS §5.5: the frontend renders all dates in `Asia/Dhaka` via
 * `Intl.DateTimeFormat`.
 *
 * @param {Date | string} date
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatDate(date, options = {}) {
  const value = typeof date === "string" ? new Date(date) : date;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "—";

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(value);
}

/**
 * Format the unit of sale for display.
 *
 * @param {string} unit
 * @returns {string}
 */
export function formatUnit(unit) {
  switch (unit) {
    case "kg":
      return "kg";
    case "piece":
      return "each";
    case "bunch":
      return "bunch";
    default:
      return unit;
  }
}
