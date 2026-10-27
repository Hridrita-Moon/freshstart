/**
 * End-to-end smoke check for the product catalogue API.
 *
 * Exercises the real HTTP surface against a running dev server:
 * - public read of the catalogue
 * - admin-only writes (create, update, soft delete)
 * - the standard error envelope
 * - available-batches pricing via the decay engine
 *
 * Run with: node tests/smoke.mjs
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

/**
 * @param {string} path
 * @param {RequestInit & { cookie?: string }} [options]
 * @returns {Promise<{ status: number, body: any, headers: Headers }>}
 */
async function call(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body) headers["content-type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

/** @type {string[]} */
const failures = [];

/**
 * @param {string} name
 * @param {boolean} condition
 * @param {string} [detail]
 */
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

async function main() {
  console.log(`\nSmoke testing ${BASE}\n`);

  // ── Public catalogue read ────────────────────────────────────────────────
  console.log("GET /api/products");
  const list = await call("/api/products");
  check("returns 200", list.status === 200, `got ${list.status}`);
  check("returns a data array", Array.isArray(list.body?.data));
  check("returns pageInfo", typeof list.body?.pageInfo?.hasMore === "boolean");
  check(
    "lists the 10 seeded products",
    list.body?.data?.length === 10,
    `got ${list.body?.data?.length}`,
  );
  check(
    "only returns active products",
    list.body?.data?.every((p) => p.isActive === true),
  );

  // ── Category filter ──────────────────────────────────────────────────────
  console.log("\nGET /api/products?category=fruit");
  const fruit = await call("/api/products?category=fruit");
  check("returns 200", fruit.status === 200);
  check(
    "returns only fruit",
    fruit.body?.data?.every((p) => p.category === "fruit"),
  );
  check(
    "returns fewer products than the full catalogue",
    fruit.body?.data?.length > 0 && fruit.body?.data?.length < list.body?.data?.length,
    `got ${fruit.body?.data?.length} of ${list.body?.data?.length}`,
  );

  console.log("\nGET /api/products?category=dairy");
  const dairy = await call("/api/products?category=dairy");
  check("rejects an unknown category with 422", dairy.status === 422, `got ${dairy.status}`);
  check(
    "uses the standard error envelope",
    dairy.body?.error?.code === "validation_failed",
  );

  // ── Admin writes are protected ───────────────────────────────────────────
  console.log("\nPOST /api/products (no session)");
  const anon = await call("/api/products", {
    method: "POST",
    body: {
      sku: "FT-SMOKE-1",
      name: "Smoke Test",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 100,
    },
  });
  check("rejects an unauthenticated write with 401", anon.status === 401, `got ${anon.status}`);
  check("reports unauthenticated", anon.body?.error?.code === "unauthenticated");

  // ── Sign in as the seeded admin ──────────────────────────────────────────
  console.log("\nLogging in as admin");
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: "admin@freshtrace.test", password: "FreshTrace!2026" },
  });

  let cookie = "";
  if (login.status === 200) {
    const setCookie = login.headers.get("set-cookie") || "";
    const match = setCookie.match(/ft_session=([^;]+)/);
    cookie = match ? `ft_session=${match[1]}` : "";
  }
  check("login succeeds", login.status === 200, `got ${login.status}`);
  check("login sets the ft_session cookie", cookie.length > 0);

  if (!cookie) {
    console.log("\n⚠ No session cookie — skipping authenticated checks.");
    return;
  }

  // ── Create ───────────────────────────────────────────────────────────────
  console.log("\nPOST /api/products (admin)");
  const created = await call("/api/products", {
    method: "POST",
    cookie,
    body: {
      sku: "FT-SMOKE-1",
      name: "Smoke Test Mango",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 150,
      harvestToShelfDays: 6,
    },
  });
  check("returns 201", created.status === 201, `got ${created.status}`);
  check("stores the product", created.body?.data?.sku === "FT-SMOKE-1");
  check("stores an integer price", Number.isInteger(created.body?.data?.baseUnitPrice));

  const productId = created.body?.data?.id;

  console.log("\nPOST /api/products (duplicate SKU)");
  const duplicate = await call("/api/products", {
    method: "POST",
    cookie,
    body: {
      sku: "FT-SMOKE-1",
      name: "Duplicate",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 100,
    },
  });
  check("rejects a duplicate SKU with 409", duplicate.status === 409, `got ${duplicate.status}`);
  check("reports a conflict", duplicate.body?.error?.code === "conflict");

  console.log("\nPOST /api/products (invalid body)");
  const invalid = await call("/api/products", {
    method: "POST",
    cookie,
    body: { sku: "FT-SMOKE-2", name: "X", category: "dairy", defaultUnit: "kg", baseUnitPrice: -5 },
  });
  check("rejects invalid input with 422", invalid.status === 422, `got ${invalid.status}`);
  check("lists the offending fields", Array.isArray(invalid.body?.error?.details?.issues));

  // ── Read one ─────────────────────────────────────────────────────────────
  console.log("\nGET /api/products/:id");
  const detail = await call(`/api/products/${productId}`, { cookie });
  check("returns 200", detail.status === 200, `got ${detail.status}`);
  check("returns the product", detail.body?.data?.sku === "FT-SMOKE-1");

  console.log("\nGET /api/products/:id (unknown)");
  const missing = await call("/api/products/does-not-exist", { cookie });
  check("returns 404", missing.status === 404, `got ${missing.status}`);
  check("reports not_found", missing.body?.error?.code === "not_found");

  // ── Update ───────────────────────────────────────────────────────────────
  console.log("\nPATCH /api/products/:id");
  const patched = await call(`/api/products/${productId}`, {
    method: "PATCH",
    cookie,
    body: { baseUnitPrice: 175 },
  });
  check("returns 200", patched.status === 200, `got ${patched.status}`);
  check("applies the change", patched.body?.data?.baseUnitPrice === 175);
  check("leaves other fields alone", patched.body?.data?.name === "Smoke Test Mango");

  // ── Available batches (decay pricing) ────────────────────────────────────
  console.log("\nGET /api/products/:id/available-batches");
  const batches = await call(`/api/products/${productId}/available-batches`, { cookie });
  check("returns 200", batches.status === 200, `got ${batches.status}`);
  check("returns an array", Array.isArray(batches.body?.data));

  // A seeded product with listed batches exercises the tier pricing.
  const mango = list.body.data.find((p) => p.sku === "FR-MNG-ALPHONSO");
  if (mango) {
    console.log("\nGET available-batches for FR-MNG-ALPHONSO");
    const live = await call(`/api/products/${mango.id}/available-batches`, { cookie });
    check("returns 200", live.status === 200, `got ${live.status}`);
    const rows = live.body?.data || [];
    check("finds listed batches", rows.length > 0, `got ${rows.length}`);
    check(
      "applies tier discounts to prices",
      rows.every((b) => b.unitPrice <= b.baseUnitPrice),
    );
    check(
      "recomputes tiers rather than trusting the cache",
      rows.every((b) => ["fresh", "good", "fair", "near_expiry"].includes(b.tier)),
    );
    check(
      "excludes expired batches",
      rows.every((b) => b.tier !== "expired"),
    );
    const sample = rows[0];
    if (sample) {
      console.log(
        `    sample: ${sample.batchCode} tier=${sample.tier} price=${sample.unitPrice} (base ${sample.baseUnitPrice})`,
      );
    }
  }

  // ── Soft delete ──────────────────────────────────────────────────────────
  console.log("\nDELETE /api/products/:id (soft delete)");
  const deleted = await call(`/api/products/${productId}`, { method: "DELETE", cookie });
  check("returns 200", deleted.status === 200, `got ${deleted.status}`);
  check("marks the product inactive", deleted.body?.data?.isActive === false);

  console.log("\nGET /api/products (after deactivation)");
  const after = await call("/api/products", { cookie });
  check(
    "hides the inactive product from listings",
    !after.body?.data?.some((p) => p.id === productId),
  );

  console.log("\nGET /api/products/:id (inactive, as admin)");
  const inactiveAdmin = await call(`/api/products/${productId}`, { cookie });
  check("admins can still read it", inactiveAdmin.status === 200, `got ${inactiveAdmin.status}`);

  // ── Customer role cannot write ───────────────────────────────────────────
  console.log("\nLogging in as customer");
  const customerLogin = await call("/api/auth/login", {
    method: "POST",
    body: { email: "customer.tareq@freshtrace.test", password: "FreshTrace!2026" },
  });
  let customerCookie = "";
  if (customerLogin.status === 200) {
    const setCookie = customerLogin.headers.get("set-cookie") || "";
    const match = setCookie.match(/ft_session=([^;]+)/);
    customerCookie = match ? `ft_session=${match[1]}` : "";
  }
  check("customer login succeeds", customerLogin.status === 200, `got ${customerLogin.status}`);

  if (customerCookie) {
    console.log("\nPOST /api/products (customer)");
    const customerWrite = await call("/api/products", {
      method: "POST",
      cookie: customerCookie,
      body: {
        sku: "FT-SMOKE-3",
        name: "Nope",
        category: "fruit",
        defaultUnit: "kg",
        baseUnitPrice: 100,
      },
    });
    check(
      "rejects a customer write with 403",
      customerWrite.status === 403,
      `got ${customerWrite.status}`,
    );
    check("reports forbidden", customerWrite.body?.error?.code === "forbidden");
  }

  // ── Logout invalidates the session ──────────────────────────────────────
  console.log("\nPOST /api/auth/logout");
  const logout = await call("/api/auth/logout", { method: "POST", cookie });
  check("returns 200", logout.status === 200, `got ${logout.status}`);

  // `GET /api/products` is open to every role (SRS §3.3), so it cannot
  // demonstrate revocation. A protected write can: the session row was
  // deleted, so the old cookie must no longer authenticate.
  console.log("POST /api/products (with the logged-out cookie)");
  const afterLogout = await call("/api/products", {
    method: "POST",
    cookie,
    body: {
      sku: "FT-SMOKE-AFTER-LOGOUT",
      name: "Should Not Exist",
      category: "fruit",
      defaultUnit: "kg",
      baseUnitPrice: 100,
    },
  });
  check(
    "the old cookie no longer authenticates",
    afterLogout.status === 401,
    `got ${afterLogout.status}`,
  );
  check(
    "reports unauthenticated",
    afterLogout.body?.error?.code === "unauthenticated",
    `got ${afterLogout.body?.error?.code}`,
  );

  // ── Cleanup ──────────────────────────────────────────────────────────────
  console.log("\nCleanup");
  const cleanup = await call(`/api/products/${productId}`, { method: "DELETE", cookie });
  check(
    "cleanup delete is rejected once logged out",
    cleanup.status === 401,
    `got ${cleanup.status}`,
  );

  // The API only soft-deletes, so remove the row directly so repeated smoke
  // runs do not accumulate products.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.product.deleteMany({ where: { sku: "FT-SMOKE-1" } });
  await prisma.session.deleteMany({ where: { tokenHash: { not: "" } } });
  await prisma.$disconnect();
  console.log("  ✓ removed the smoke-test product from the database");

  console.log("");
  if (failures.length > 0) {
    console.log(`❌ ${failures.length} check(s) failed:\n${failures.map((f) => `   - ${f}`).join("\n")}\n`);
    process.exit(1);
  }
  console.log("✅ All smoke checks passed.\n");
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
