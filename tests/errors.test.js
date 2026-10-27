import { describe, it, expect } from "vitest";
import { ApiError, ERROR_CODES, apiError, errorResponse, handleRouteError } from "@/lib/errors";

/**
 * Error envelope tests (SRS §6.1).
 *
 * Every error response uses:
 * `{ error: { code, message, details } }`
 */

describe("apiError", () => {
  it("derives the HTTP status from the error code", () => {
    expect(apiError(ERROR_CODES.NOT_FOUND, "x").status).toBe(404);
    expect(apiError(ERROR_CODES.CONFLICT, "x").status).toBe(409);
    expect(apiError(ERROR_CODES.VALIDATION_FAILED, "x").status).toBe(422);
    expect(apiError(ERROR_CODES.UNAUTHENTICATED, "x").status).toBe(401);
    expect(apiError(ERROR_CODES.FORBIDDEN, "x").status).toBe(403);
    expect(apiError(ERROR_CODES.INTERNAL_ERROR, "x").status).toBe(500);
  });

  it("carries the details through", () => {
    const err = apiError(ERROR_CODES.VALIDATION_FAILED, "bad", { path: "sku" });
    expect(err.details).toEqual({ path: "sku" });
  });

  it("allows an explicit status override", () => {
    const err = new ApiError(ERROR_CODES.CONFLICT, "x", 418);
    expect(err.status).toBe(418);
  });
});

describe("errorResponse", () => {
  it("builds the standard envelope", async () => {
    const res = errorResponse(ERROR_CODES.NOT_FOUND, "Product not found.");
    const body = await res.json();

    expect(body).toEqual({
      error: { code: "not_found", message: "Product not found.", details: {} },
    });
  });

  it("uses the mapped status code", async () => {
    const res = errorResponse(ERROR_CODES.CONFLICT, "Duplicate.");
    expect(res.status).toBe(409);
  });

  it("includes details when supplied", async () => {
    const res = errorResponse(ERROR_CODES.VALIDATION_FAILED, "Bad.", {
      issues: [{ path: "sku", message: "Required." }],
    });
    const body = await res.json();
    expect(body.error.details.issues).toHaveLength(1);
  });
});

describe("handleRouteError", () => {
  it("passes an ApiError through with its code and status", async () => {
    const res = handleRouteError(apiError(ERROR_CODES.FORBIDDEN, "Nope."));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toBe("Nope.");
  });

  it("maps a Prisma unique-constraint error to a conflict", async () => {
    const res = handleRouteError({
      code: "P2002",
      meta: { target: ["sku"] },
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("conflict");
    expect(body.error.details.constraint).toEqual(["sku"]);
  });

  it("maps a Prisma not-found error to a 404", async () => {
    const res = handleRouteError({ code: "P2025" });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("hides internals of an unexpected error", async () => {
    const res = handleRouteError(new Error("database exploded at /secret/path"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
