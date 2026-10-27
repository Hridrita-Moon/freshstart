import { cookies } from "next/headers";
import { ERROR_CODES, apiError } from "@/lib/errors";
import { SESSION_COOKIE_NAME, getSessionByToken, maybeRefreshSession } from "@/lib/auth/session";

/**
 * Role-based access control.
 *
 * SRS §3.3 route permission matrix:
 *
 * | Route prefix                        | customer | aggregator | qc_staff | admin |
 * |-------------------------------------|----------|------------|----------|-------|
 * | /api/auth/*                         | ✓        | ✓          | ✓        | ✓     |
 * | /api/products (GET)                 | ✓        | ✓          | ✓        | ✓     |
 * | /api/products (POST/PATCH/DELETE)   | —        | —          | —        | ✓     |
 * | /api/batches (POST)                 | —        | ✓          | —        | ✓     |
 * | /api/batches/:id/qc-logs (POST)     | —        | —          | ✓        | ✓     |
 * | /api/orders (POST)                  | ✓        | —          | —        | ✓     |
 * | /api/orders (GET — all)             | —        | —          | —        | ✓     |
 */

/**
 * @typedef {object} AuthContext
 * @property {import("@prisma/client").User} user
 * @property {import("@prisma/client").Session} session
 */

/**
 * Resolve the current authenticated user, or `null`.
 *
 * @returns {Promise<AuthContext | null>}
 */
export async function getAuthContext() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionByToken(token);
  if (!session) return null;
  await maybeRefreshSession(session);
  return { user: session.user, session };
}

/**
 * Require an authenticated session.
 *
 * @returns {Promise<AuthContext>}
 * @throws {import("@/lib/errors").ApiError} `unauthenticated` when there is no valid session
 */
export async function requireSession() {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw apiError(ERROR_CODES.UNAUTHENTICATED, "You must be signed in to do that.");
  }
  return ctx;
}

/**
 * Require a session held by one of the given roles.
 *
 * @param {readonly string[]} roles
 * @returns {Promise<AuthContext>}
 * @throws {import("@/lib/errors").ApiError} `unauthenticated` or `forbidden`
 */
export async function requireRole(roles) {
  const ctx = await requireSession();
  if (!roles.includes(ctx.user.role)) {
    throw apiError(
      ERROR_CODES.FORBIDDEN,
      "You do not have permission to perform this action.",
      { requiredRoles: roles },
    );
  }
  return ctx;
}

/**
 * Require an admin session.
 *
 * @returns {Promise<AuthContext>}
 */
export async function requireAdmin() {
  return requireRole(["admin"]);
}
