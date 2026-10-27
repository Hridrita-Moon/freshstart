import { describe, it, expect } from "vitest";
import {
  validateLoginInput,
  validateRegisterInput,
} from "@/lib/validation/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

/**
 * Auth validation unit tests.
 *
 * These are pure functions — no database, no cookies.
 */

const VALID_REGISTER = {
  name: "Alice Rahman",
  email: "alice@example.com",
  password: "tomatoes",
};

/**
 * @param {import("@/lib/validation/schema").ValidationIssue[]} errors
 * @param {string} path
 * @returns {boolean}
 */
function hasIssue(errors, path) {
  return errors.some((e) => e.path === path);
}

describe("validateRegisterInput", () => {
  it("accepts a valid registration", () => {
    const result = validateRegisterInput(VALID_REGISTER);
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("Alice Rahman");
    expect(result.data.email).toBe("alice@example.com");
    expect(result.data.password).toBe("tomatoes");
  });

  it("trims whitespace from the name and the email", () => {
    const result = validateRegisterInput({
      name: "  Alice Rahman  ",
      email: "  alice@example.com  ",
      password: "tomatoes",
    });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("Alice Rahman");
    expect(result.data.email).toBe("alice@example.com");
  });

  it("does NOT trim the password", () => {
    // `login/route.js` reads the submitted password raw, so trimming it here
    // would hash a different string than the one the visitor signs in with —
    // the account would be created but could never be used.
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      password: "  tomatoes  ",
    });
    expect(result.success).toBe(true);
    expect(result.data.password).toBe("  tomatoes  ");
  });

  it("rejects a missing name", () => {
    const result = validateRegisterInput({ ...VALID_REGISTER, name: undefined });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "name")).toBe(true);
  });

  it("rejects a name shorter than two characters", () => {
    const result = validateRegisterInput({ ...VALID_REGISTER, name: "A" });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "name")).toBe(true);
  });

  it("rejects a missing email", () => {
    const result = validateRegisterInput({ ...VALID_REGISTER, email: undefined });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "email")).toBe(true);
  });

  it("rejects an empty email", () => {
    const result = validateRegisterInput({ ...VALID_REGISTER, email: "" });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "email")).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "email")).toBe(true);
  });

  it("rejects an email without a dotted domain", () => {
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      email: "alice@example",
    });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "email")).toBe(true);
  });

  it("rejects a missing password", () => {
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      password: undefined,
    });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "password")).toBe(true);
  });

  it("rejects a seven-character password", () => {
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      password: "1234567",
    });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "password")).toBe(true);
  });

  it("reports a short password as a single issue", () => {
    // The contract is one issue per field. The length rule used to be
    // checked twice — once inline and once through `meetsPasswordPolicy`,
    // which is the same rule — so every short password produced the same
    // issue twice.
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      password: "1234567",
    });
    expect(result.success).toBe(false);

    const passwordIssues = result.errors.filter((e) => e.path === "password");
    expect(passwordIssues).toHaveLength(1);
    expect(passwordIssues[0].message).toBe(
      `Must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  });

  it("reports one issue per field when several fields are invalid", () => {
    const result = validateRegisterInput({
      name: "",
      email: "nope",
      password: "short",
    });
    expect(result.success).toBe(false);

    for (const path of ["name", "email", "password"]) {
      expect(result.errors.filter((e) => e.path === path)).toHaveLength(1);
    }
  });

  it("accepts an eight-character password", () => {
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      password: "12345678",
    });
    expect(result.success).toBe(true);
    expect(result.data.password).toBe("12345678");
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it("rejects a password longer than bcrypt's 72-byte limit", () => {
    // bcryptjs silently truncates past 72 bytes, so a longer password would
    // authenticate against any other password sharing its first 72 bytes.
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      password: "a".repeat(73),
    });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "password")).toBe(true);
  });

  it("accepts a password of exactly bcrypt's 72-byte limit", () => {
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      password: "a".repeat(72),
    });
    expect(result.success).toBe(true);
    expect(result.data.password).toHaveLength(72);
  });

  it("measures the password limit in bytes, not characters", () => {
    // 30 three-byte characters = 90 bytes, over the limit even though the
    // character count is well under 72.
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      password: "আ".repeat(30),
    });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "password")).toBe(true);
  });

  it("rejects an oversized email", () => {
    const result = validateRegisterInput({
      ...VALID_REGISTER,
      email: `${"a".repeat(250)}@example.com`,
    });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "email")).toBe(true);
  });

  it("reports every invalid field at once", () => {
    const result = validateRegisterInput({
      name: "",
      email: "nope",
      password: "short",
    });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(hasIssue(result.errors, "name")).toBe(true);
    expect(hasIssue(result.errors, "email")).toBe(true);
    expect(hasIssue(result.errors, "password")).toBe(true);
  });

  it("handles a null body without throwing", () => {
    expect(validateRegisterInput(null).success).toBe(false);
  });
});

describe("validateLoginInput", () => {
  it("accepts a valid login payload", () => {
    const result = validateLoginInput({
      email: "alice@example.com",
      password: "tomatoes",
    });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe("alice@example.com");
    expect(result.data.password).toBe("tomatoes");
  });

  it("requires an email", () => {
    const result = validateLoginInput({ email: "", password: "tomatoes" });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "email")).toBe(true);
  });

  it("requires a password", () => {
    const result = validateLoginInput({ email: "alice@example.com", password: "" });
    expect(result.success).toBe(false);
    expect(hasIssue(result.errors, "password")).toBe(true);
  });

  it("does not enforce the registration password length", () => {
    const result = validateLoginInput({
      email: "alice@example.com",
      password: "short",
    });
    expect(result.success).toBe(true);
  });

  it("does not enforce the email format", () => {
    // A malformed address and an unknown address must produce the same
    // result, so the route can answer both with one `401`.
    const result = validateLoginInput({
      email: "not-an-email",
      password: "tomatoes",
    });
    expect(result.success).toBe(true);
  });

  it("handles a null body without throwing", () => {
    expect(validateLoginInput(null).success).toBe(false);
  });
});
