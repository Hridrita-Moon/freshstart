import { describe, it, expect, afterEach } from "vitest";
import { getMultipliers, readMultiplier } from "@/lib/decay/constants";

/**
 * Decay multiplier configuration (SRS §16.6).
 *
 * The multipliers are env vars so the operations team can tune the decay
 * curve without a code deploy. The defaults match the SRS §5.1 tier table.
 */

const ENV_KEYS = [
  "DECAY_DAY1_MULTIPLIER",
  "DECAY_DAY3_MULTIPLIER",
  "DECAY_DAY5_MULTIPLIER",
  "DECAY_NEAR_EXPIRY_MULTIPLIER",
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("getMultipliers", () => {
  it("returns the documented defaults", () => {
    expect(getMultipliers()).toEqual({
      fresh: 1.0,
      good: 0.8,
      fair: 0.6,
      near_expiry: 0.3,
      expired: 0,
    });
  });

  it("applies environment overrides", () => {
    process.env.DECAY_DAY3_MULTIPLIER = "0.75";
    expect(getMultipliers().good).toBe(0.75);
  });

  it("ignores an invalid override and uses the default", () => {
    process.env.DECAY_DAY3_MULTIPLIER = "not-a-number";
    expect(getMultipliers().good).toBe(0.8);
  });

  it("ignores an out-of-range override", () => {
    process.env.DECAY_NEAR_EXPIRY_MULTIPLIER = "5";
    expect(getMultipliers().near_expiry).toBe(0.3);
  });

  it("never lets the expired multiplier be non-zero", () => {
    expect(getMultipliers().expired).toBe(0);
  });
});

describe("readMultiplier", () => {
  it("returns the fallback for an unset variable", () => {
    expect(readMultiplier("DECAY_MISSING", 0.5)).toBe(0.5);
  });

  it("returns the fallback for an empty variable", () => {
    process.env.DECAY_TEST_MULTIPLIER = "";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0.5);
  });

  it("parses a valid numeric string", () => {
    process.env.DECAY_TEST_MULTIPLIER = "0.42";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0.42);
  });

  it("accepts zero", () => {
    process.env.DECAY_TEST_MULTIPLIER = "0";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0);
  });

  it("rejects a negative value", () => {
    process.env.DECAY_TEST_MULTIPLIER = "-0.2";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0.5);
  });

  it("rejects a value above one", () => {
    process.env.DECAY_TEST_MULTIPLIER = "1.5";
    expect(readMultiplier("DECAY_TEST_MULTIPLIER", 0.5)).toBe(0.5);
  });

  delete process.env.DECAY_TEST_MULTIPLIER;
});
