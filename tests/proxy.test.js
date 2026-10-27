import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { proxy } from "@/proxy";

/**
 * Tests for the product-detail 404 handling in `src/proxy.js`.
 *
 * `notFound()` renders a *client* error boundary, so a throw from a Server
 * Component leaves the initial HTML empty — the message only appears after
 * hydration. The proxy resolves the SKU before the page renders and rewrites
 * an unknown one to `/404`, which Next.js serves through the root
 * `not-found.jsx` as a normal page: a real 404 status and server-rendered
 * markup.
 *
 * These tests cover the decision the proxy makes, not Next.js' rewrite
 * machinery.
 */

/**
 * A minimal stand-in for the parts of `NextRequest` the proxy uses.
 *
 * @param {string} pathname
 * @returns {{ nextUrl: { pathname: string }, url: string }}
 */
function fakeRequest(pathname) {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
  };
}

let product;

beforeAll(async () => {
  product = await prisma.product.create({
    data: {
      sku: "TEST-PROXY-SKU",
      name: "Proxy Test Mango",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 100,
      harvestToShelfDays: 5,
      isActive: true,
    },
  });
});

afterAll(async () => {
  await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
});

describe("proxy", () => {
  it("lets a known SKU through", async () => {
    const res = await proxy(fakeRequest("/app/products/TEST-PROXY-SKU"));

    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rewrites an unknown SKU to the 404 route", async () => {
    const res = await proxy(fakeRequest("/app/products/NO-SUCH-SKU"));

    const location = res.headers.get("x-middleware-rewrite");
    expect(location).toContain("/404");
    expect(res.status).toBe(404);
  });

  it("rewrites a delisted SKU to the 404 route", async () => {
    await prisma.product.update({
      where: { id: product.id },
      data: { isActive: false },
    });

    const res = await proxy(fakeRequest("/app/products/TEST-PROXY-SKU"));

    expect(res.headers.get("x-middleware-rewrite")).toContain("/404");
    expect(res.status).toBe(404);

    await prisma.product.update({
      where: { id: product.id },
      data: { isActive: true },
    });
  });
});
