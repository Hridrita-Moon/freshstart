import { listResponse } from "@/lib/api-response";
import { handleRouteError } from "@/lib/errors";
import { listAvailableBatches } from "@/lib/services/products";

/**
 * `GET /api/products/:id/available-batches` — the batches of a product that
 * are currently buyable, with their recomputed freshness tier and price.
 *
 * Auth: any signed-in role (SRS §3.3).
 */
export async function GET(_request, ctx) {
  try {
    const { id } = await ctx.params;
    const batches = await listAvailableBatches(id);
    return listResponse(batches);
  } catch (err) {
    return handleRouteError(err);
  }
}
