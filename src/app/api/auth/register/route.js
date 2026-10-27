import { NextResponse } from "next/server";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_DAYS,
  generateSessionToken,
  hashSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { validateRegisterInput } from "@/lib/validation/auth";

/**
 * `POST /api/auth/register` — create a customer account and sign it in.
 *
 * Body: `{ name, email, password }`.
 *
 * SRS §3.1: the raw session token lives only in the httpOnly cookie; the
 * database stores its SHA-256 hash. There is no JWT and no client-side token
 * store.
 *
 * Registration is self-service and always creates a **customer** account —
 * the request body cannot choose a role. The session is created here rather
 * than by a follow-up call to `/api/auth/login`, so the caller needs one
 * round-trip instead of two; the session-creation code is deliberately
 * identical to `login/route.js` so the two paths cannot drift.
 */
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    // Normalise once, at the route boundary, so the validator and the unique
    // index both see the canonical address. `  Alice@Example.COM ` and
    // `alice@example.com` are the same account.
    const input =
      body && typeof body === "object" ? { ...body } : {};
    if (typeof input.email === "string") {
      input.email = input.email.trim().toLowerCase();
    }

    const result = validateRegisterInput(input);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The account could not be created because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const { name, email, password } = result.data;

    const passwordHash = await hashPassword(password);

    // The token is generated before the transaction so the raw value never
    // needs to be read back out of the database — only its hash is stored.
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(
      Date.now() + SESSION_MAX_AGE_DAYS * 86_400_000,
    );

    // The user row and the session row are written in one transaction: if the
    // session insert fails, the account must not survive as an orphan the
    // visitor cannot claim — a retry would hit the unique index and report
    // the email as "already taken" instead of "try again".
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: "customer",
          status: "active",
        },
        select: { id: true, email: true, name: true, role: true },
      });

      await tx.session.create({
        data: {
          userId: created.id,
          tokenHash,
          expiresAt,
          userAgent: request.headers.get("user-agent"),
          ipAddress:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        },
        select: { id: true },
      });

      // Registration is a first sign-in, so it stamps `lastLoginAt` exactly
      // as `login/route.js` does. The two paths cannot drift.
      await tx.user.update({
        where: { id: created.id },
        data: { lastLoginAt: new Date() },
      });

      return created;
    });

    const response = NextResponse.json(
      {
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      { status: 201 },
    );

    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (err) {
    // A duplicate email is a field-level conflict, not a generic one: the
    // form renders `details.issues[]` per input, and `handleRouteError`'s
    // P2002 branch only carries a `constraint` name, so the visitor would
    // see a banner instead of an error on the email field.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err).code === "P2002"
    ) {
      return errorResponse(
        ERROR_CODES.CONFLICT,
        "An account with that email already exists.",
        {
          issues: [
            { path: "email", message: "An account with that email already exists." },
          ],
        },
      );
    }

    return handleRouteError(err);
  }
}
