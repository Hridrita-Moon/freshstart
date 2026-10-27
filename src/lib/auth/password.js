import bcrypt from "bcryptjs";

/**
 * Password hashing.
 *
 * SRS §3.1: passwords are hashed with bcrypt (cost factor 12) via `bcryptjs`
 * — the pure-JS implementation, because native builds are unavailable on
 * Vercel's serverless filesystem.
 */

/** bcrypt work factor. 12 is the value fixed by the SRS. */
export const BCRYPT_COST = 12;

/**
 * Hash a plaintext password.
 *
 * @param {string} plain
 * @returns {Promise<string>}
 */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a stored hash.
 *
 * Returns `false` (rather than throwing) for a malformed hash, so a corrupt
 * row cannot crash a login request.
 *
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain, hash) {
  if (typeof plain !== "string" || typeof hash !== "string" || hash.length === 0) {
    return false;
  }
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Minimum password length enforced at registration.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * @param {string} password
 * @returns {boolean}
 */
export function meetsPasswordPolicy(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}
