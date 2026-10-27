import { NextResponse } from "next/server";

/**
 * Standard error envelope (SRS §6.1).
 *
 * Every error response in the API uses this shape so clients can branch on a
 * stable `code` rather than parsing prose:
 *
 * ```json
 * { "error": { "code": "not_found", "message": "...", "details": {} } }
 * ```
 */
export const ERROR_CODES = /** @type {const} */ ({
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  VALIDATION_FAILED: "validation_failed",
  RATE_LIMITED: "rate_limited",
  PAYMENT_FAILED: "payment_failed",
  DELIVERY_UNAVAILABLE: "delivery_unavailable",
  INTERNAL_ERROR: "internal_error",
});

/** Default HTTP status for each error code. */
const STATUS_BY_CODE = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  payment_failed: 402,
  delivery_unavailable: 503,
  internal_error: 500,
};

/**
 * An error that carries an API error code and HTTP status.
 *
 * Route handlers throw these; the `handleRouteError` helper below converts
 * them into the standard envelope. Anything that is not an `ApiError` is
 * treated as an unexpected failure and reported as `internal_error` without
 * leaking internals to the client.
 */
export class ApiError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, status, details = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code] ?? 500;
    this.details = details;
  }
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @returns {ApiError}
 */
export function apiError(code, message, details) {
  return new ApiError(code, message, undefined, details);
}

/**
 * Build a JSON error response in the standard envelope.
 *
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @param {number} [status]
 * @returns {NextResponse}
 */
export function errorResponse(code, message, details = {}, status) {
  return NextResponse.json(
    { error: { code, message, details } },
    { status: status ?? STATUS_BY_CODE[code] ?? 500 },
  );
}

/**
 * Convert a thrown value into a standard error response.
 *
 * `ApiError` instances pass through with their code and details. A Prisma
 * unique-constraint violation is mapped to `conflict` (SRS §6.4.2 — duplicate
 * SKU is rejected with a conflict error). Everything else becomes
 * `internal_error` and is logged server-side.
 *
 * @param {unknown} err
 * @returns {NextResponse}
 */
export function handleRouteError(err) {
  if (err instanceof ApiError) {
    return errorResponse(err.code, err.message, err.details, err.status);
  }

  // Prisma P2002 = unique constraint failed.
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err).code === "P2002"
  ) {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      "A record with these unique values already exists.",
      { constraint: (err).meta?.target ?? null },
    );
  }

  // Prisma P2025 = record not found.
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err).code === "P2025"
  ) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "The requested record was not found.");
  }

  console.error("[api] unhandled error:", err);
  return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred.");
}
