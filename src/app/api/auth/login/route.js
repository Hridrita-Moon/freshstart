import { NextResponse } from "next/server";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE_NAME,
  createSession,
  destroyAllSessionsForUser,
  sessionCookieOptions,
} from "@/lib/auth/session";

/**
 * `POST /api/auth/login` — create a session and set the `ft_session` cookie.
 *
 * Body: `{ email, password }`.
 *
 * SRS §3.1: the raw session token lives only in the httpOnly cookie; the
 * database stores its SHA-256 hash. There is no JWT and no client-side token
 * store.
 */
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "Email and password are required.",
        { issues: [{ path: "email", message: "Email and password are required." }] },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // The same message for an unknown email and a wrong password, so the
    // response does not reveal which accounts exist.
    const invalid = errorResponse(ERROR_CODES.UNAUTHENTICATED, "Invalid email or password.");

    if (!user) {
      // Hash anyway so a missing account and a wrong password take a similar
      // amount of time, closing a timing side channel.
      await verifyPassword(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid");
      return invalid;
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      return invalid;
    }

    if (user.status === "suspended") {
      return errorResponse(
        ERROR_CODES.FORBIDDEN,
        "This account has been suspended. Please contact support.",
      );
    }

    // A suspended account's sessions were already revoked, but clear any
    // stragglers so a suspended user cannot keep an old cookie alive.
    await destroyAllSessionsForUser(user.id);

    const { token } = await createSession(user.id, {
      userAgent: request.headers.get("user-agent"),
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const response = NextResponse.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
