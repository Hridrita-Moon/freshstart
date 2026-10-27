import { MIN_PASSWORD_LENGTH, meetsPasswordPolicy } from "@/lib/auth/password";
import { Validator, finish, requireString } from "@/lib/validation/schema";

/**
 * Authentication input validation.
 *
 * SRS §3.1 / §4.2: an account is identified by a unique, normalised email
 * address and protected by a password. Registration is open to the public and
 * always creates a *customer* account — the caller never chooses a role.
 *
 * The validators follow the house pattern from `src/lib/validation/product.js`:
 * a `Validator` accumulates issues, the primitives mutate it and return the
 * trimmed value (or `undefined` on failure), and `finish` turns the run into
 * a `{ success, data }` / `{ success, errors }` result.
 */

/**
 * @typedef {object} RegisterInput
 * @property {string} name
 * @property {string} email
 * @property {string} password
 */

/**
 * @typedef {object} LoginInput
 * @property {string} email
 * @property {string} password
 */

/** Pragmatic email shape check — one `@`, a dotted domain, no whitespace. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Maximum lengths. The email limit matches the database column budget.
 */
const MAX_EMAIL_LENGTH = 255;

/**
 * bcrypt's hard input limit.
 *
 * bcryptjs silently truncates anything past 72 bytes, so a longer password
 * would authenticate against any other password sharing its first 72 bytes.
 * The limit is enforced here so a user can never register a password that
 * does not round-trip.
 */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Read a password **without trimming it**.
 *
 * `requireString` returns `value.trim()`, which is right for a name or an
 * email but wrong for a password: `login/route.js` reads the submitted
 * password raw, so trimming here would make `" tomatoes "` and `"tomatoes"`
 * hash differently while only the trimmed form ever gets compared.
 *
 * @param {Validator} v
 * @param {unknown} value
 * @returns {string | undefined}
 */
function requirePassword(v, value) {
  if (typeof value !== "string") {
    v.add("password", "Must be a string.");
    return undefined;
  }

  // The limit is in bytes, not characters — bcrypt counts bytes.
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    v.add("password", `Must be at most ${MAX_PASSWORD_BYTES} bytes.`);
    return undefined;
  }

  return value;
}

/**
 * Read a password and require it to be non-empty.
 *
 * The login validator only checks presence — an unknown email and a wrong
 * password must produce the same result — but an empty password is still a
 * missing field, not a wrong one.
 *
 * @param {Validator} v
 * @param {unknown} value
 * @returns {string | undefined}
 */
function requirePresentPassword(v, value) {
  const password = requirePassword(v, value);
  if (password === undefined) return undefined;

  if (password.length === 0) {
    v.add("password", "Is required.");
    return undefined;
  }

  return password;
}

/**
 * Validate a registration payload.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult<RegisterInput>}
 */
export function validateRegisterInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  const name = requireString(v, input.name, "name", { min: 2, max: 120 });

  const email = requireString(v, input.email, "email", { min: 3, max: MAX_EMAIL_LENGTH });
  if (email !== undefined && !EMAIL_PATTERN.test(email)) {
    v.add("email", "Must be a valid email address.");
  }

  const password = requirePassword(v, input.password);
  // One check, one issue. `meetsPasswordPolicy` *is* the length rule, so
  // checking the length separately as well would emit the same issue twice
  // for a short password — and the contract is one issue per field.
  if (password !== undefined && !meetsPasswordPolicy(password)) {
    v.add("password", `Must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  return finish(v, { name, email, password });
}

/**
 * Validate a login payload.
 *
 * Presence only — the format is deliberately *not* checked, because an
 * unknown email and a malformed email must produce the same `401` response
 * as a wrong password. The route owns that decision.
 *
 * @param {unknown} body
 * @returns {import("@/lib/validation/schema").ValidationResult<LoginInput>}
 */
export function validateLoginInput(body) {
  const v = new Validator();
  const input = /** @type {Record<string, unknown>} */ (body ?? {});

  const email = requireString(v, input.email, "email", { min: 1, max: MAX_EMAIL_LENGTH });
  // Raw, for the same reason as in `validateRegisterInput` — the login route
  // never trims the password either.
  const password = requirePresentPassword(v, input.password);

  return finish(v, { email, password });
}
