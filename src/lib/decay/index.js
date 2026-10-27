import {
  APP_TIMEZONE,
  DHAKA_UTC_OFFSET_HOURS,
  MS_PER_DAY,
  TIER_BOUNDARIES,
  getMultipliers,
} from "@/lib/decay/constants";

export * from "@/lib/decay/constants";

/**
 * Freshness decay engine.
 *
 * SRS §5.2:
 *
 * ```js
 * computeDecay(harvestDate, now, harvestToShelfDays)
 *   -> { tier, multiplier, action, daysSinceHarvest, remainingShelfDays }
 * ```
 *
 * The day-boundary rule is `Math.floor((nowUtc - harvestMidnightDhaka) / 86_400_000)`.
 * That makes Day 0 cover `[00:00, 24:00)` Dhaka on the harvest day, Day 1 the
 * next full Dhaka day, and so on. A batch harvested on 2026-10-09 is `fresh`
 * for the whole of 2026-10-09 and 2026-10-10, and becomes `good` at 00:00
 * Dhaka time on 2026-10-11.
 */

/**
 * Convert a Date to the UTC instant corresponding to midnight on that
 * calendar date in Dhaka time.
 *
 * `harvestDate` is stored as midnight Dhaka time (UTC+06:00), so this
 * normalises a Date to the start of its Dhaka calendar day.
 *
 * @param {Date} date
 * @returns {number} UTC epoch milliseconds of Dhaka midnight
 */
export function dhakaMidnightUtcMs(date) {
  // Shift the instant by the fixed Dhaka offset, read the UTC calendar parts
  // of the shifted instant, then shift back.
  const shifted = new Date(date.getTime() + DHAKA_UTC_OFFSET_HOURS * 3_600_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  return Date.UTC(year, month, day) - DHAKA_UTC_OFFSET_HOURS * 3_600_000;
}

/**
 * Compute the freshness tier for a batch.
 *
 * @param {Date} harvestDate
 * @param {Date} now
 * @param {number} harvestToShelfDays
 * @returns {{
 *   tier: import("@/lib/decay/constants").Tier,
 *   multiplier: number,
 *   action: import("@/lib/decay/constants").DecayAction,
 *   daysSinceHarvest: number,
 *   remainingShelfDays: number
 * }}
 */
export function computeDecay(harvestDate, now, harvestToShelfDays) {
  if (!(harvestDate instanceof Date) || Number.isNaN(harvestDate.getTime())) {
    throw new TypeError("harvestDate must be a valid Date.");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("now must be a valid Date.");
  }

  const shelfDays =
    Number.isFinite(harvestToShelfDays) && harvestToShelfDays > 0
      ? Math.floor(harvestToShelfDays)
      : 1;

  const harvestMidnight = dhakaMidnightUtcMs(harvestDate);
  const daysSinceHarvest = Math.floor((now.getTime() - harvestMidnight) / MS_PER_DAY);

  // A `now` before the harvest date would produce a negative day count. The
  // batch has not been harvested yet, so treat it as the freshest tier.
  const elapsedDays = Math.max(0, daysSinceHarvest);

  const multipliers = getMultipliers();
  const tier = resolveTier(elapsedDays, shelfDays);
  const action = resolveAction(tier);

  return {
    tier,
    multiplier: multipliers[tier],
    action,
    daysSinceHarvest: elapsedDays,
    remainingShelfDays: Math.max(0, shelfDays - elapsedDays),
  };
}

/**
 * Map a day count onto a tier.
 *
 * The expiry check comes first: a product whose shelf life is shorter than
 * the `near_expiry` band (e.g. `harvestToShelfDays = 1`) expires on the day
 * after its shelf life ends, rather than sitting in a fixed tier band. This
 * matches SRS §5.1, where `expired` applies at "days > harvestToShelfDays".
 *
 * @param {number} days
 * @param {number} shelfDays
 * @returns {import("@/lib/decay/constants").Tier}
 */
export function resolveTier(days, shelfDays) {
  // Beyond the shelf life the produce is expired, whatever the day count.
  if (days > shelfDays) return "expired";

  if (days < TIER_BOUNDARIES.good) return "fresh"; // 0–1
  if (days < TIER_BOUNDARIES.fair) return "good"; // 2–3
  if (days < TIER_BOUNDARIES.nearExpiry) return "fair"; // 4–5

  // 6 → shelf is near_expiry.
  return "near_expiry";
}

/**
 * The action a tier implies.
 *
 * @param {import("@/lib/decay/constants").Tier} tier
 * @returns {import("@/lib/decay/constants").DecayAction}
 */
export function resolveAction(tier) {
  switch (tier) {
    case "fresh":
    case "good":
    case "fair":
      return "list";
    case "near_expiry":
      return "list_with_warning";
    case "expired":
      return "delist";
    default:
      return "list";
  }
}

/**
 * Apply the tier multiplier to a base price.
 *
 * SRS §5.3: `displayedUnitPrice = Math.round(product.baseUnitPrice * multiplier)`.
 *
 * @param {number} baseUnitPrice
 * @param {number} multiplier
 * @returns {number}
 */
export function applyPriceMultiplier(baseUnitPrice, multiplier) {
  return Math.round(baseUnitPrice * multiplier);
}

/**
 * Convenience wrapper: compute the tier and the displayed price together.
 *
 * @param {Date} harvestDate
 * @param {Date} now
 * @param {{ baseUnitPrice: number, harvestToShelfDays: number }} product
 * @returns {{
 *   tier: import("@/lib/decay/constants").Tier,
 *   multiplier: number,
 *   action: import("@/lib/decay/constants").DecayAction,
 *   daysSinceHarvest: number,
 *   remainingShelfDays: number,
 *   unitPrice: number
 * }}
 */
export function computeDecayPrice(harvestDate, now, product) {
  const decay = computeDecay(harvestDate, now, product.harvestToShelfDays);
  return {
    ...decay,
    unitPrice: applyPriceMultiplier(product.baseUnitPrice, decay.multiplier),
  };
}

export { APP_TIMEZONE };
