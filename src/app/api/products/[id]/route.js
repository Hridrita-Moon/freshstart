import { NextResponse } from "next/server";
import { dataResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { getAuthContext, requireAdmin } from "@/lib/auth/guard";
import {
  deactivateProduct,
  getProductById,
  updateProduct,
} from "@/lib/services/products";
import { validateProductUpdate } from "@/lib/validation/product";

/**
 * `GET /api/products/:id` — product detail.
 *
 * Auth: any signed-in role. Inactive products are visible to admins only.
 */
export async function GET(_request, ctx) {
  try {
    const { id } = await ctx.params;

    const auth = await getAuthContext();
    const includeInactive = auth?.user.role === "admin";

    const product = await getProductById(id, { includeInactive });
    return dataResponse(product);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `PATCH /api/products/:id` — update a product.
 *
 * Auth: admin only (SRS §3.3).
 */
export async function PATCH(request, ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    const result = validateProductUpdate(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The product could not be updated because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const product = await updateProduct(id, result.data);
    return dataResponse(product);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `DELETE /api/products/:id` — soft delete.
 *
 * Sets `isActive = false`. The product disappears from customer-facing
 * listings, while batches referencing it remain intact and readable.
 *
 * Auth: admin only (SRS §3.3).
 */
export async function DELETE(_request, ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;

    const product = await deactivateProduct(id);
    return dataResponse(product);
  } catch (err) {
    return handleRouteError(err);
  }
}
