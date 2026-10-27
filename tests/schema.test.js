import { describe, it, expect } from "vitest";
import {
  Validator,
  coerceInt,
  finish,
  optionalString,
  requireBoolean,
  requireEnum,
  requireInt,
  requireNumber,
  requireString,
} from "@/lib/validation/schema";

/**
 * Tests for the shared validation toolkit (SRS §2.4).
 */

describe("Validator", () => {
  it("collects issues without throwing", () => {
    const v = new Validator();
    v.add("sku", "Required.");
    v.add("name", "Required.");

    expect(v.failed).toBe(true);
    expect(v.issues).toHaveLength(2);
  });

  it("is not failed when no issue is added", () => {
    expect(new Validator().failed).toBe(false);
  });

  it("records an issue only when a check fails", () => {
    const v = new Validator();
    v.check("x", true, "path", "never added");
    expect(v.failed).toBe(false);

    v.check("x", false, "path", "added");
    expect(v.failed).toBe(true);
  });
});

describe("finish", () => {
  it("returns the data when there are no issues", () => {
    const v = new Validator();
    const result = finish(v, { a: 1 });
    expect(result).toEqual({ success: true, data: { a: 1 } });
  });

  it("returns the issues when validation failed", () => {
    const v = new Validator();
    v.add("a", "Bad.");
    const result = finish(v, { a: 1 });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ path: "a", message: "Bad." }]);
  });
});

describe("requireString", () => {
  it("returns a trimmed string", () => {
    const v = new Validator();
    expect(requireString(v, "  hello  ", "name")).toBe("hello");
    expect(v.failed).toBe(false);
  });

  it("rejects a non-string", () => {
    const v = new Validator();
    expect(requireString(v, 42, "name")).toBeUndefined();
    expect(v.issues[0].path).toBe("name");
  });

  it("rejects a string below the minimum length", () => {
    const v = new Validator();
    requireString(v, "a", "name", { min: 2 });
    expect(v.failed).toBe(true);
  });

  it("rejects a string above the maximum length", () => {
    const v = new Validator();
    requireString(v, "abcdef", "name", { max: 3 });
    expect(v.failed).toBe(true);
  });
});

describe("requireInt", () => {
  it("accepts an integer within range", () => {
    const v = new Validator();
    expect(requireInt(v, 10, "n", { min: 1, max: 100 })).toBe(10);
    expect(v.failed).toBe(false);
  });

  it("rejects a float", () => {
    const v = new Validator();
    expect(requireInt(v, 10.5, "n")).toBeUndefined();
    expect(v.failed).toBe(true);
  });

  it("rejects a non-number", () => {
    const v = new Validator();
    requireInt(v, "10", "n");
    expect(v.failed).toBe(true);
  });

  it("rejects NaN and Infinity", () => {
    const v = new Validator();
    requireInt(v, NaN, "n");
    requireInt(v, Infinity, "n");
    expect(v.issues).toHaveLength(2);
  });

  it("enforces the minimum and maximum bounds", () => {
    const v = new Validator();
    requireInt(v, 0, "n", { min: 1 });
    requireInt(v, 1000, "n", { max: 100 });
    expect(v.issues).toHaveLength(2);
  });
});

describe("requireNumber", () => {
  it("accepts a float", () => {
    const v = new Validator();
    expect(requireNumber(v, 10.5, "n")).toBe(10.5);
    expect(v.failed).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    const v = new Validator();
    requireNumber(v, NaN, "n");
    requireNumber(v, Infinity, "n");
    expect(v.issues).toHaveLength(2);
  });
});

describe("requireEnum", () => {
  it("accepts a value in the allowlist", () => {
    const v = new Validator();
    expect(requireEnum(v, "fruit", "category", ["fruit", "vegetable"])).toBe("fruit");
    expect(v.failed).toBe(false);
  });

  it("rejects a value outside the allowlist", () => {
    const v = new Validator();
    requireEnum(v, "dairy", "category", ["fruit", "vegetable"]);
    expect(v.failed).toBe(true);
  });

  it("rejects a non-string", () => {
    const v = new Validator();
    requireEnum(v, 5, "category", ["fruit"]);
    expect(v.failed).toBe(true);
  });
});

describe("requireBoolean", () => {
  it("accepts booleans", () => {
    const v = new Validator();
    expect(requireBoolean(v, true, "active")).toBe(true);
    expect(requireBoolean(v, false, "active")).toBe(false);
    expect(v.failed).toBe(false);
  });

  it("rejects a non-boolean", () => {
    const v = new Validator();
    requireBoolean(v, "true", "active");
    expect(v.failed).toBe(true);
  });
});

describe("optionalString", () => {
  it("returns undefined for an absent value", () => {
    const v = new Validator();
    expect(optionalString(v, undefined, "x")).toBeUndefined();
    expect(optionalString(v, null, "x")).toBeUndefined();
    expect(v.failed).toBe(false);
  });

  it("treats an empty string as absent", () => {
    const v = new Validator();
    expect(optionalString(v, "   ", "x")).toBeUndefined();
    expect(v.failed).toBe(false);
  });

  it("rejects a value over the maximum length", () => {
    const v = new Validator();
    optionalString(v, "abcdef", "x", 3);
    expect(v.failed).toBe(true);
  });

  it("rejects a non-string", () => {
    const v = new Validator();
    optionalString(v, 42, "x");
    expect(v.failed).toBe(true);
  });
});

describe("coerceInt", () => {
  it("parses a numeric string", () => {
    const v = new Validator();
    expect(coerceInt(v, "20", "limit", { min: 1, max: 100 })).toBe(20);
    expect(v.failed).toBe(false);
  });

  it("uses the fallback for an absent value", () => {
    const v = new Validator();
    expect(coerceInt(v, undefined, "limit", { fallback: 20 })).toBe(20);
    expect(coerceInt(v, "", "limit", { fallback: 20 })).toBe(20);
    expect(v.failed).toBe(false);
  });

  it("reports an absent value when there is no fallback", () => {
    const v = new Validator();
    coerceInt(v, undefined, "limit");
    expect(v.failed).toBe(true);
  });

  it("rejects a non-integer string", () => {
    const v = new Validator();
    coerceInt(v, "abc", "limit", { fallback: 20 });
    expect(v.failed).toBe(true);
  });

  it("enforces the bounds", () => {
    const v = new Validator();
    coerceInt(v, "0", "limit", { min: 1, max: 100 });
    coerceInt(v, "500", "limit", { min: 1, max: 100 });
    expect(v.issues).toHaveLength(2);
  });
});
