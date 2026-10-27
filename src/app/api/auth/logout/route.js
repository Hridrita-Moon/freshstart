import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import {
  SESSION_COOKIE_NAME,
  destroySession,
  sessionCookieOptions,
} from "@/lib/auth/session";

/**
 * `POST /api/auth/logout` — delete the session row and clear the cookie.
 *
 * SRS §3.1: because sessions are server-side, logout is immediate and global
 * — there is no token to wait out. Deleting the row invalidates the cookie
 * instantly.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    await destroySession(token);

    const response = NextResponse.json({ data: { success: true } });

    // Clear the cookie with the same attributes it was set with, so the
    // browser removes it rather than storing an empty replacement.
    response.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `GET /api/auth/logout` is not a valid verb for this route.
 */
export async function GET() {
  return errorResponse(
    ERROR_CODES.VALIDATION_FAILED,
    "Use POST to log out.",
  );
}
