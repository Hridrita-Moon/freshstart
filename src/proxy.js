import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Product-detail 404 handling.
 *
 * `notFound()` is the idiomatic way to render a 404 from a Server Component,
 * but it throws an error, and in Next.js 16 that error is caught by a
 * *client* error boundary. The server has already flushed the page shell by
 * then, so the not-found markup never reaches the initial HTML — the browser
 * is served an empty `<body>` and the message only appears once the bundle
 * hydrates. Crawlers that do not execute JavaScript see a blank page.
 *
 * The Next.js docs point at this exact trade-off: the response status can
 * only be preserved by running the check *before* the body streams, and the
 * way to do that from outside the render is Proxy — "check the slug in Proxy,
 * then rewrite it to a not-found route".
 *
 * So the SKU is resolved here, before the page renders. An unknown SKU is
 * rewritten to `/404`, which Next.js serves through the root `not-found.jsx`
 * as a normal page: a real `404` status and a fully server-rendered body.
 *
 * Proxy runs on the Node.js runtime by default, so the Prisma client works
 * here. The lookup is a single indexed primary-key read.
 */

/**
 * @param {import("next/server").NextRequest} request
 * @returns {Promise<import("next/server").NextResponse>}
 */
export async function proxy(request) {
  const sku = request.nextUrl.pathname.split("/").pop();

  if (!sku) {
    return NextResponse.next();
  }

  const product = await prisma.product.findFirst({
    where: { sku, isActive: true },
    select: { id: true },
  });

  if (product) {
    return NextResponse.next();
  }

  // Rewrite rather than redirect: the shopper should stay on the URL they
  // asked for, and the rewrite keeps the response a 404 rather than a 307.
  return NextResponse.rewrite(new URL("/404", request.url), {
    status: 404,
  });
}

export const config = {
  matcher: "/app/products/:sku",
};
