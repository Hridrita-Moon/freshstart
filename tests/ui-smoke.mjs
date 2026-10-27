/**
 * UI smoke test.
 *
 * Verifies that the catalogue and product detail pages render with live data
 * from the database, and that the freshness/price presentation is correct.
 *
 * Run with the dev server up: node tests/ui-smoke.mjs
 */
const BASE = process.env.UI_BASE_URL || "http://localhost:3000";

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

/**
 * @param {string} path
 * @returns {Promise<{ status: number, html: string }>}
 */
async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "text/html" },
  });
  return { status: res.status, html: await res.text() };
}

/**
 * Strip tags so text assertions are not confused by markup.
 *
 * Attribute values are kept as text as well: an accessible name such as
 * `aria-label="Search the catalogue"` is part of the rendered UI even though
 * it is not visible text, and the smoke test asserts on it.
 *
 * @param {string} html
 * @returns {string}
 */
function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, (tag) => {
      // Keep the values of the attributes that carry an accessible name or a
      // value the assertions care about.
      const kept = [];
      const attr = /\b(aria-label|aria-labelledby|title|placeholder|value|alt)=("([^"]*)"|'([^']*)')/gi;
      let match;
      while ((match = attr.exec(tag)) !== null) {
        kept.push(match[3] ?? match[4] ?? "");
      }
      return kept.length > 0 ? ` ${kept.join(" ")} ` : " ";
    })
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  console.log(`\nUI smoke test against ${BASE}\n`);

  // ── Catalogue page ───────────────────────────────────────────────────────
  console.log("GET /app/products");
  const catalog = await get("/app/products");
  const catalogText = text(catalog.html);

  check("returns 200", catalog.status === 200, `got ${catalog.status}`);
  check("renders the page heading", catalogText.includes("Today's produce"));
  check(
    "renders the page description",
    catalogText.includes("harvested in the last few days"),
  );

  // Product names from the seed data.
  for (const name of [
    "Alphonso Mango",
    "Tomato",
    "Coriander (Dhania)",
    "Jumbo Orange",
    "Okra (Bhindi)",
  ]) {
    check(`renders "${name}"`, catalogText.includes(name));
  }

  check("renders the FreshTrace header", catalogText.includes("FreshTrace"));
  check("renders the category filters", catalogText.includes("Fruit"));
  check("renders the Vegetables filter", catalogText.includes("Vegetables"));
  check("renders the search box", catalogText.includes("Search the catalogue"));

  // Prices are rendered as BDT currency.
  check(
    "renders BDT prices",
    catalogText.includes("৳") || catalogText.includes("BDT"),
    "no currency marker found",
  );

  // Freshness tier labels from the seeded batches.
  check("renders a freshness tier", /Fresh|Near expiry|Good|Fair/.test(catalogText));
  check(
    "renders the shelf-life attribute",
    catalogText.includes("day shelf life"),
  );
  check("renders origin districts", catalogText.includes("Rajshahi"));

  // ── Category filter (server-rendered) ───────────────────────────────────
  console.log("\nGET /app/products?category=fruit");
  const fruit = await get("/app/products?category=fruit");
  const fruitText = text(fruit.html);

  check("returns 200", fruit.status === 200);
  check("shows Alphonso Mango", fruitText.includes("Alphonso Mango"));
  check("shows Jumbo Orange", fruitText.includes("Jumbo Orange"));
  check(
    "hides vegetables",
    !fruitText.includes("Okra (Bhindi)"),
    "vegetable product leaked into the fruit filter",
  );
  check(
    "hides herbs",
    !fruitText.includes("Coriander (Dhania)"),
    "herb product leaked into the fruit filter",
  );

  // ── Search filter ───────────────────────────────────────────────────────
  console.log("\nGET /app/products?q=mango");
  const search = await get("/app/products?q=mango");
  const searchText = text(search.html);

  check("returns 200", search.status === 200);
  check("shows Alphonso Mango", searchText.includes("Alphonso Mango"));
  check("shows Himkopa Mango", searchText.includes("Himkopa Mango"));
  check(
    "hides unrelated produce",
    !searchText.includes("Bottle Gourd (Lau)"),
    "unrelated product leaked into the search",
  );

  // ── Product detail page ──────────────────────────────────────────────────
  console.log("\nGET /app/products/FR-MNG-ALPHONSO");
  const detail = await get("/app/products/FR-MNG-ALPHONSO");
  const detailText = text(detail.html);

  check("returns 200", detail.status === 200, `got ${detail.status}`);
  check("renders the product name", detailText.includes("Alphonso Mango"));
  check("renders the SKU", detailText.includes("FR-MNG-ALPHONSO"));
  check(
    "renders the description",
    detailText.includes("Premium Alphonso mangoes"),
  );
  check("renders the shelf life", detailText.includes("7 days"));
  check("renders the origin", detailText.includes("Rajshahi"));
  check("renders the batches section", detailText.includes("Available batches"));
  check("renders the harvest date", detailText.includes("Harvested"));
  check("renders a batch code", /FT-MNG-\d{4}-\d{2}-\d{2}-[A-Z0-9]+/.test(detailText));
  check("renders the add-to-basket action", detailText.includes("Add to basket"));
  check("renders the subscription action", detailText.includes("Add to weekly subscription"));
  check("renders a back link", detailText.includes("Back to catalogue"));

  // The discount explanation ties the price to the freshness tier.
  check(
    "explains the freshness discount",
    detailText.includes("discounted for freshness") ||
      detailText.includes("computed from each batch"),
  );

  // ── Unknown product ─────────────────────────────────────────────────────
  console.log("\nGET /app/products/NO-SUCH-SKU");
  const missing = await get("/app/products/NO-SUCH-SKU");
  const missingText = text(missing.html);

  check("returns 404", missing.status === 404, `got ${missing.status}`);
  check(
    "renders the not-found message",
    missingText.includes("couldn't find that produce"),
  );

  // ── Root redirect ───────────────────────────────────────────────────────
  console.log("\nGET /");
  const root = await fetch(`${BASE}/`, { redirect: "manual" });
  check(
    "redirects to the catalogue",
    root.status === 307 || root.status === 302 || root.status === 308,
    `got ${root.status}`,
  );
  check(
    "redirects to /app/products",
    (root.headers.get("location") ?? "").includes("/app/products"),
    `location: ${root.headers.get("location")}`,
  );

  // ── API still works alongside the UI ────────────────────────────────────
  console.log("\nGET /api/products (API still functional)");
  const api = await fetch(`${BASE}/api/products`);
  const apiBody = await api.json();
  check("returns 200", api.status === 200, `got ${api.status}`);
  check("returns 10 products", apiBody?.data?.length === 10, `got ${apiBody?.data?.length}`);

  // ── Auth pages ───────────────────────────────────────────────────────────
  console.log("\nGET /login");
  const login = await get("/login");
  const loginText = text(login.html);

  check("returns 200", login.status === 200, `got ${login.status}`);
  check("renders the welcome heading", loginText.includes("Welcome back"));
  check("renders an email field", loginText.includes("Email"));
  check("renders a password field", loginText.includes("Password"));
  check("links to the register page", login.html.includes('href="/register"'));
  check("does not ask for a name", !login.html.includes('name="name"'));

  console.log("\nGET /register");
  const register = await get("/register");
  const registerText = text(register.html);

  check("returns 200", register.status === 200, `got ${register.status}`);
  check("renders the account heading", registerText.includes("Create your account"));
  check("asks for a name", register.html.includes('name="name"'));
  check("links to the login page", register.html.includes('href="/login"'));
  check("states the minimum password length", registerText.includes("at least 8 characters"));

  // ── Navbar session states ────────────────────────────────────────────────
  console.log("\nGET /app/products (signed-out navbar)");
  const anon = await get("/app/products");
  const anonText = text(anon.html);

  check("shows Login", anonText.includes("Login"));
  check("shows Register", anonText.includes("Register"));
  check("does not show Log out", !anonText.includes("Log out"));

  // The not-yet-built destinations must not be links: a disabled-looking
  // `<a href>` still lets keyboard and screen-reader users activate a 404.
  for (const dead of ["/app/cart", "/app/orders", "/app/subscriptions", "/app/account"]) {
    check(
      `"${dead}" is not a link`,
      !anon.html.includes(`href="${dead}"`),
      "rendered as an anchor",
    );
  }
  check(
    "unbuilt destinations are marked aria-disabled",
    (anon.html.match(/aria-disabled="true"/g) ?? []).length >= 4,
  );
  check("keeps the catalogue link live", anon.html.includes('href="/app/products"'));

  // ── Registration and the signed-in navbar ────────────────────────────────
  console.log("\nPOST /api/auth/register");
  const email = `smoke.${Date.now()}@test.local`;

  const registered = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Smoke Tester", email, password: "tomatoes" }),
  });
  const registeredBody = await registered.json();

  check("returns 201", registered.status === 201, `got ${registered.status}`);
  check("creates a customer account", registeredBody?.data?.role === "customer");
  check("returns the account name", registeredBody?.data?.name === "Smoke Tester");

  const setCookie = registered.headers.get("set-cookie") ?? "";
  check("sets the session cookie", setCookie.includes("ft_session="));
  check("the session cookie is HttpOnly", setCookie.includes("HttpOnly"));
  check("the session cookie is SameSite=Lax", /SameSite=lax/i.test(setCookie));

  const cookie = setCookie.split(";")[0];
  const signedIn = await fetch(`${BASE}/app/products`, {
    headers: { accept: "text/html", cookie },
  });
  const signedInText = text(await signedIn.text());

  check("the signed-in navbar shows the name", signedInText.includes("Smoke Tester"));
  check("the signed-in navbar shows Log out", signedInText.includes("Log out"));

  // ── Logout ───────────────────────────────────────────────────────────────
  console.log("\nPOST /api/auth/logout");
  const loggedOut = await fetch(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { cookie },
  });

  check("returns 200", loggedOut.status === 200, `got ${loggedOut.status}`);
  check("clears the session cookie", /Max-Age=0/i.test(loggedOut.headers.get("set-cookie") ?? ""));

  // ── Login ────────────────────────────────────────────────────────────────
  console.log("\nPOST /api/auth/login");
  const signedIn2 = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "tomatoes" }),
  });

  check("returns 200", signedIn2.status === 200, `got ${signedIn2.status}`);
  check(
    "sets the session cookie",
    (signedIn2.headers.get("set-cookie") ?? "").includes("ft_session="),
  );

  // ── Login failures ────────────────────────────────────────────────────────
  // An unknown email and a wrong password must be indistinguishable, so the
  // two responses are compared rather than each being checked in isolation.
  console.log("\nPOST /api/auth/login (bad credentials)");

  const unknownEmail = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `nobody.${Date.now()}@test.local`, password: "tomatoes" }),
  });
  const unknownEmailBody = await unknownEmail.json();

  const wrongPassword = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  const wrongPasswordBody = await wrongPassword.json();

  check("an unknown email returns 401", unknownEmail.status === 401, `got ${unknownEmail.status}`);
  check("a wrong password returns 401", wrongPassword.status === 401, `got ${wrongPassword.status}`);
  check(
    "both failures report the same code",
    unknownEmailBody?.error?.code === wrongPasswordBody?.error?.code,
    `${unknownEmailBody?.error?.code} vs ${wrongPasswordBody?.error?.code}`,
  );
  check(
    "both failures report the same message",
    unknownEmailBody?.error?.message === wrongPasswordBody?.error?.message,
  );
  check(
    "neither failure sets a session cookie",
    !(unknownEmail.headers.get("set-cookie") ?? "").includes("ft_session=") &&
      !(wrongPassword.headers.get("set-cookie") ?? "").includes("ft_session="),
  );

  console.log("");

  if (failures.length > 0) {
    console.log(
      `❌ ${failures.length} check(s) failed:\n${failures.map((f) => `   - ${f}`).join("\n")}\n`,
    );
    process.exit(1);
  }
  console.log("✅ All UI checks passed.\n");
}

main().catch((err) => {
  console.error("UI smoke test crashed:", err);
  process.exit(1);
});
