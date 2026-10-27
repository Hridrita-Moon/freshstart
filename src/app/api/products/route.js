import { NextResponse } from "next/server";
import { dataResponse, listResponse } from "@/lib/api-response";
import { ERROR_CODES, errorResponse, handleRouteError } from "@/lib/errors";
import { getAuthContext, requireAdmin } from "@/lib/auth/guard";
import { listProducts, createProduct } from "@/lib/services/products";
import { validateProductInput } from "@/lib/validation/product";
import { PRODUCT_CATEGORIES } from "@/lib/constants";

/**
 * `GET /api/products` — list active products.
 *
 * Auth: any signed-in role (SRS §3.3). Inactive products are excluded unless
 * the caller is an admin and explicitly asks for them.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get("category");
    const includeInactiveParam = searchParams.get("includeInactive");

    if (categoryParam && !PRODUCT_CATEGORIES.includes(categoryParam)) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        `Unknown category. Must be one of: ${PRODUCT_CATEGORIES.join(", ")}.`,
        { path: "category" },
      );
    }

    const ctx = await getAuthContext();
    const includeInactive =
      ctx?.user.role === "admin" && includeInactiveParam === "true";

    const products = await listProducts({ category: categoryParam ?? undefined, includeInactive });
    return listResponse(products);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `POST /api/products` — create a product.
 *
 * Auth: admin only (SRS §3.3).
 */
export async function POST(request) {
  try {
    await requireAdmin();

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.VALIDATION_FAILED, "Request body must be valid JSON.");
    }

    const result = validateProductInput(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_FAILED,
        "The product could not be created because some fields are invalid.",
        { issues: result.errors },
      );
    }

    const product = await createProduct(result.data);
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
