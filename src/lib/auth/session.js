import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Server-side session management.
 *
 * SRS §3.1:
 * - The session token is 32 cryptographically random bytes, base64url-encoded.
 * - Only the token's SHA-256 hash is stored on the `Session` row, so a
 *   database leak does not expose usable tokens.
 * - The raw token lives exclusively in the `ft_session` httpOnly cookie.
 * - Lifetime is 30 days with a rolling refresh: if more than half the
 *   lifetime has elapsed since the last touch, `expiresAt` is pushed out.
 */

/** Cookie name. Fixed by the SRS — not configurable per environment. */
export const SESSION_COOKIE_NAME = "ft_session";

/** Session lifetime in days (SRS §3.1). */
export const SESSION_MAX_AGE_DAYS = 30;

/** Refresh the session once more than half the lifetime has elapsed. */
export const SESSION_REFRESH_THRESHOLD_DAYS = 15;

const MS_PER_DAY = 86_400_000;

/**
 * Generate a fresh opaque session token.
 * @returns {string}
 */
export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash a session token for storage.
 *
 * SRS §3.1 notes a `SESSION_SECRET` env var as an optional secret used to
 * derive the hash; a plain SHA-256 is used when it is unset.
 *
 * @param {string} token
 * @returns {string}
 */
export function hashSessionToken(token) {
  const secret = process.env.SESSION_SECRET || "";
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

/**
 * Create a session row for a user and return the raw token.
 *
 * The raw token is returned to the caller so it can be written to the
 * cookie. It is never persisted.
 *
 * @param {string} userId
 * @param {{ userAgent?: string | null, ipAddress?: string | null }} [meta]
 * @returns {Promise<{ token: string, sessionId: string, expiresAt: Date }>}
 */
export async function createSession(userId, meta = {}) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * MS_PER_DAY);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
    select: { id: true, expiresAt: true },
  });

  return { token, sessionId: session.id, expiresAt: session.expiresAt };
}

/**
 * Look up a valid session by its raw token.
 *
 * Expired sessions are deleted on sight, so a stale cookie cannot be used
 * and the table does not accumulate dead rows.
 *
 * @param {string | undefined | null} token
 * @returns {Promise<import("@prisma/client").Session | null>}
 */
export async function getSessionByToken(token) {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session;
}

/**
 * Rolling refresh — extend `expiresAt` when more than half the lifetime has
 * elapsed since the session was last used.
 *
 * @param {import("@prisma/client").Session} session
 * @returns {Promise<void>}
 */
export async function maybeRefreshSession(session) {
  const thresholdMs = SESSION_REFRESH_THRESHOLD_DAYS * MS_PER_DAY;
  const elapsed = Date.now() - session.lastUsedAt.getTime();

  if (elapsed < thresholdMs) {
    // Still update `lastUsedAt` so the rolling window tracks real usage.
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});
    return;
  }

  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * MS_PER_DAY);
  await prisma.session
    .update({
      where: { id: session.id },
      data: { expiresAt, lastUsedAt: new Date() },
    })
    .catch(() => {});
}

/**
 * Delete a session by raw token (logout).
 *
 * @param {string | undefined | null} token
 * @returns {Promise<void>}
 */
export async function destroySession(token) {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

/**
 * Delete every session belonging to a user.
 *
 * Used when an account is suspended — revocation must be immediate, so all
 * sessions are removed in the same transaction as the status change.
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function destroyAllSessionsForUser(userId) {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Build the `Set-Cookie` options for the session cookie.
 *
 * @param {number} maxAgeSeconds
 * @returns {import("next/dist/compiled/@edge-runtime/cookies").ResponseCookie}
 */
export function sessionCookieOptions(maxAgeSeconds = SESSION_MAX_AGE_DAYS * 86_400) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Read the current session from the request cookie.
 *
 * This is the Server-Component / Route-Handler entry point (SRS §3.4).
 *
 * @returns {Promise<import("@prisma/client").Session | null>}
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionByToken(token);
  if (!session) return null;
  await maybeRefreshSession(session);
  return session;
}
