/**
 * Freshness decay constants.
 *
 * SRS §5.1 defines the tier table; SRS §16.6 makes the multipliers
 * overridable by environment variable so the operations team can tune the
 * curve without a code deploy.
 */

/** @typedef {'fresh' | 'good' | 'fair' | 'near_expiry' | 'expired'} Tier */
/** @typedef {'list' | 'list_with_warning' | 'delist'} DecayAction */

/** The app's display timezone. All calendar dates are Dhaka dates. */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Asia/Dhaka";

/** Fixed offset of the Dhaka timezone: UTC+06:00, no daylight saving. */
export const DHAKA_UTC_OFFSET_HOURS = 6;

/** Milliseconds in a day. */
export const MS_PER_DAY = 86_400_000;

/**
 * The last day index (inclusive) for each tier, ignoring the expiry boundary
 * which depends on the product's `harvestToShelfDays`.
 *
 * SRS §5.1:
 *   0–1        fresh        1.00
 *   2–3        good         0.80
 *   4–5        fair         0.60
 *   6 → shelf  near_expiry  0.30
 *   > shelf    expired      0.00
 */
export const TIER_BOUNDARIES = /** @type {const} */ ({
  good: 2, // days 0–1 are fresh
  fair: 4, // days 2–3 are good
  nearExpiry: 6, // days 4–5 are fair
});

/**
 * Price multipliers, overridable by env (SRS §16.6).
 *
 * @returns {Record<Tier, number>}
 */
export function getMultipliers() {
  return {
    fresh: readMultiplier("DECAY_DAY1_MULTIPLIER", 1.0),
    good: readMultiplier("DECAY_DAY3_MULTIPLIER", 0.8),
    fair: readMultiplier("DECAY_DAY5_MULTIPLIER", 0.6),
    near_expiry: readMultiplier("DECAY_NEAR_EXPIRY_MULTIPLIER", 0.3),
    expired: 0,
  };
}

/**
 * Read a multiplier from the environment, falling back to the documented
 * default when the variable is unset or not a valid number.
 *
 * @param {string} envKey
 * @param {number} fallback
 * @returns {number}
 */
export function readMultiplier(envKey, fallback) {
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}
