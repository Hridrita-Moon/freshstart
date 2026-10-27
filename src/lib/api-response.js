import { NextResponse } from "next/server";

/**
 * Cursor-based pagination (SRS §6.2).
 *
 * Lists return:
 * ```json
 * { "data": [], "pageInfo": { "nextCursor": "string | null", "hasMore": true } }
 * ```
 *
 * Query params: `?cursor=<opaque>&limit=<int 1-100, default 20>`.
 */

/** Default and maximum page size. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Build a paginated list response.
 *
 * @param {unknown[]} data
 * @param {{ nextCursor?: string | null, hasMore?: boolean }} [pageInfo]
 * @returns {NextResponse}
 */
export function listResponse(data, pageInfo = {}) {
  return NextResponse.json({
    data,
    pageInfo: {
      nextCursor: pageInfo.nextCursor ?? null,
      hasMore: pageInfo.hasMore ?? false,
    },
  });
}

/**
 * Build a single-resource response.
 *
 * @param {unknown} data
 * @returns {NextResponse}
 */
export function dataResponse(data) {
  return NextResponse.json({ data });
}
