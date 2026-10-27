import { describe, it, expect } from "vitest";
import {
  BCRYPT_COST,
  hashPassword,
  meetsPasswordPolicy,
  verifyPassword,
} from "@/lib/auth/password";

describe("hashPassword", () => {
  it("produces a bcrypt hash with the configured cost factor", async () => {
    const hash = await hashPassword("FreshTrace!2026");
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash).toContain(`$${BCRYPT_COST}$`);
  });

  it("never stores the plaintext", async () => {
    const hash = await hashPassword("FreshTrace!2026");
    expect(hash).not.toContain("FreshTrace!2026");
  });

  it("salts each hash, so the same password hashes differently", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    await expect(verifyPassword("correct-horse-battery", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    await expect(verifyPassword("anything", "not-a-bcrypt-hash")).resolves.toBe(false);
  });

  it("returns false for empty inputs", async () => {
    await expect(verifyPassword("", "$2a$12$abcdef")).resolves.toBe(false);
    await expect(verifyPassword("password", "")).resolves.toBe(false);
  });
});

describe("meetsPasswordPolicy", () => {
  it("requires at least eight characters", () => {
    expect(meetsPasswordPolicy("short")).toBe(false);
    expect(meetsPasswordPolicy("12345678")).toBe(true);
  });

  it("rejects non-strings", () => {
    expect(meetsPasswordPolicy(undefined)).toBe(false);
    expect(meetsPasswordPolicy(12345678)).toBe(false);
  });
});
