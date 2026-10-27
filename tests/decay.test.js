import { describe, it, expect } from "vitest";
import {
  applyPriceMultiplier,
  computeDecay,
  computeDecayPrice,
  dhakaMidnightUtcMs,
  resolveTier,
} from "@/lib/decay";

/**
 * SRS §5.1 tier table:
 *
 *   0–1                fresh        1.00
 *   2–3                good         0.80
 *   4–5                fair         0.60
 *   6 → shelfDays      near_expiry  0.30
 *   > shelfDays        expired      0.00
 *
 * The day-boundary rule is `Math.floor((nowUtc - harvestMidnightDhaka) / 86_400_000)`.
 */

/**
 * A Date at midnight Dhaka time for a given UTC calendar date.
 *
 * @param {number} year
 * @param {number} month 1-based
 * @param {number} day
 * @returns {Date}
 */
function dhakaMidnight(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day) - 6 * 3_600_000);
}

describe("computeDecay — tier assignment", () => {
  const harvest = dhakaMidnight(2026, 10, 9);

  it("assigns fresh on the harvest day", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 9), 7);
    expect(result.tier).toBe("fresh");
    expect(result.multiplier).toBe(1.0);
    expect(result.action).toBe("list");
    expect(result.daysSinceHarvest).toBe(0);
  });

  it("stays fresh through the end of the next Dhaka day (day 1)", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 10), 7);
    expect(result.tier).toBe("fresh");
    expect(result.daysSinceHarvest).toBe(1);
  });

  it("becomes good at 00:00 Dhaka on day 2", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 11), 7);
    expect(result.tier).toBe("good");
    expect(result.multiplier).toBe(0.8);
    expect(result.daysSinceHarvest).toBe(2);
  });

  it("stays good on day 3", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 12), 7);
    expect(result.tier).toBe("good");
    expect(result.daysSinceHarvest).toBe(3);
  });

  it("becomes fair on day 4", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 13), 7);
    expect(result.tier).toBe("fair");
    expect(result.multiplier).toBe(0.6);
  });

  it("stays fair on day 5", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 14), 7);
    expect(result.tier).toBe("fair");
    expect(result.daysSinceHarvest).toBe(5);
  });

  it("becomes near_expiry on day 6", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 15), 7);
    expect(result.tier).toBe("near_expiry");
    expect(result.multiplier).toBe(0.3);
    expect(result.action).toBe("list_with_warning");
  });

  it("stays near_expiry on the last valid shelf day", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 16), 7);
    expect(result.tier).toBe("near_expiry");
    expect(result.daysSinceHarvest).toBe(7);
    expect(result.remainingShelfDays).toBe(0);
  });

  it("becomes expired the day after the shelf life ends", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 17), 7);
    expect(result.tier).toBe("expired");
    expect(result.multiplier).toBe(0);
    expect(result.action).toBe("delist");
  });
});

describe("computeDecay — day-boundary rule", () => {
  const harvest = dhakaMidnight(2026, 10, 9);

  it("treats the whole Dhaka calendar day as one unit", () => {
    // 23:59:59 Dhaka on the harvest day is still day 0.
    const lateOnHarvestDay = new Date(
      Date.UTC(2026, 9, 9, 23, 59, 59) - 6 * 3_600_000,
    );
    const result = computeDecay(harvest, lateOnHarvestDay, 7);
    expect(result.daysSinceHarvest).toBe(0);
    expect(result.tier).toBe("fresh");
  });

  it("crosses the boundary exactly at 00:00 Dhaka", () => {
    // 23:59:59 Dhaka on 2026-10-09 is 17:59:59 UTC — still day 0.
    const justBefore = new Date(Date.UTC(2026, 9, 9, 17, 59, 59));
    // 00:00:00 Dhaka on 2026-10-10 is 18:00:00 UTC on 2026-10-09 — day 1.
    const exactly = new Date(Date.UTC(2026, 9, 9, 18, 0, 0));

    expect(computeDecay(harvest, justBefore, 7).daysSinceHarvest).toBe(0);
    expect(computeDecay(harvest, exactly, 7).daysSinceHarvest).toBe(1);
  });

  it("is unaffected by the host timezone", () => {
    // The same instant expressed in UTC and in Dhaka yields the same day count.
    const nowUtc = new Date("2026-10-11T06:00:00.000Z");
    const result = computeDecay(harvest, nowUtc, 7);
    expect(result.daysSinceHarvest).toBe(2);
    expect(result.tier).toBe("good");
  });

  it("clamps a pre-harvest 'now' to day 0 rather than going negative", () => {
    const beforeHarvest = new Date(harvest.getTime() - 3 * 86_400_000);
    const result = computeDecay(harvest, beforeHarvest, 7);
    expect(result.daysSinceHarvest).toBe(0);
    expect(result.tier).toBe("fresh");
  });
});

describe("computeDecay — shelf life variation", () => {
  const harvest = dhakaMidnight(2026, 10, 9);

  it("expires a short-shelf-life product before a long-shelf-life one", () => {
    const now = dhakaMidnight(2026, 10, 16);
    expect(computeDecay(harvest, now, 3).tier).toBe("expired");
    expect(computeDecay(harvest, now, 10).tier).toBe("near_expiry");
  });

  it("reports remaining shelf days", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 11), 10);
    expect(result.remainingShelfDays).toBe(8);
  });

  it("treats a non-positive shelf life as one day", () => {
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 11), 0);
    expect(result.daysSinceHarvest).toBe(2);
    expect(result.tier).toBe("expired");
  });

  it("lets expiry take precedence over the fixed tier bands", () => {
    // A 1-day shelf life expires on day 2, even though day 2 would
    // otherwise fall in the `good` band.
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 11), 1);
    expect(result.tier).toBe("expired");
    expect(result.multiplier).toBe(0);
    expect(result.action).toBe("delist");
  });

  it("keeps a long-shelf-life product in the tier bands", () => {
    // The same day count is still `good` when the shelf life allows it.
    const result = computeDecay(harvest, dhakaMidnight(2026, 10, 11), 14);
    expect(result.tier).toBe("good");
  });
});

describe("computeDecay — input validation", () => {
  it("rejects an invalid harvest date", () => {
    expect(() => computeDecay(new Date("nonsense"), new Date(), 5)).toThrow(TypeError);
  });

  it("rejects an invalid now", () => {
    expect(() => computeDecay(new Date(), new Date("nonsense"), 5)).toThrow(TypeError);
  });
});

describe("resolveTier", () => {
  it("maps day counts to tiers", () => {
    expect(resolveTier(0, 7)).toBe("fresh");
    expect(resolveTier(1, 7)).toBe("fresh");
    expect(resolveTier(2, 7)).toBe("good");
    expect(resolveTier(3, 7)).toBe("good");
    expect(resolveTier(4, 7)).toBe("fair");
    expect(resolveTier(5, 7)).toBe("fair");
    expect(resolveTier(6, 7)).toBe("near_expiry");
    expect(resolveTier(7, 7)).toBe("near_expiry");
    expect(resolveTier(8, 7)).toBe("expired");
  });
});

describe("applyPriceMultiplier", () => {
  it("applies and rounds the multiplier", () => {
    expect(applyPriceMultiplier(220, 1.0)).toBe(220);
    expect(applyPriceMultiplier(220, 0.8)).toBe(176);
    expect(applyPriceMultiplier(220, 0.6)).toBe(132);
    expect(applyPriceMultiplier(220, 0.3)).toBe(66);
    expect(applyPriceMultiplier(220, 0.0)).toBe(0);
  });

  it("rounds to the nearest whole taka", () => {
    expect(applyPriceMultiplier(85, 0.8)).toBe(68);
    expect(applyPriceMultiplier(45, 0.6)).toBe(27);
  });
});

describe("computeDecayPrice", () => {
  it("returns the tier and the displayed price together", () => {
    const harvest = dhakaMidnight(2026, 10, 9);
    const result = computeDecayPrice(harvest, dhakaMidnight(2026, 10, 12), {
      baseUnitPrice: 220,
      harvestToShelfDays: 7,
    });

    expect(result.tier).toBe("good");
    expect(result.unitPrice).toBe(176);
    expect(result.multiplier).toBe(0.8);
  });
});

describe("dhakaMidnightUtcMs", () => {
  it("normalises an instant to the start of its Dhaka day", () => {
    // 2026-10-09 05:30 UTC is 11:30 Dhaka on 2026-10-09.
    const instant = new Date("2026-10-09T05:30:00.000Z");
    const midnight = dhakaMidnightUtcMs(instant);
    expect(new Date(midnight).toISOString()).toBe("2026-10-08T18:00:00.000Z");
  });

  it("normalises a late-night UTC instant to the following Dhaka day", () => {
    // 2026-10-09 20:00 UTC is 2026-10-10 02:00 Dhaka.
    const instant = new Date("2026-10-09T20:00:00.000Z");
    const midnight = dhakaMidnightUtcMs(instant);
    expect(new Date(midnight).toISOString()).toBe("2026-10-09T18:00:00.000Z");
  });
});
