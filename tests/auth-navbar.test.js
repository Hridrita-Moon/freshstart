import { describe, it, expect, vi, beforeEach } from "vitest";
import { prerender } from "react-dom/static";
import { createElement } from "react";

/**
 * Navbar session-state tests.
 *
 * `src/app/(customer)/layout.jsx` is a Server Component: it resolves the
 * session with `getSession()` and renders either the signed-out links
 * (Login / Register) or the signed-in controls (name + Log out).
 *
 * The session module is mocked so the layout can be rendered with a chosen
 * session, and `react-dom/server` turns the element tree into HTML so the
 * assertions can look at what a visitor would actually see.
 */

const sessionState = { session: null };

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getSession: vi.fn(async () => sessionState.session),
  };
});

// `LogoutButton` is a Client Component that calls `useRouter()`, which needs
// a mounted App Router. The router is not under test here — only the Navbar
// that decides whether to render it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { default: CustomerLayout } = await import("@/app/(customer)/layout.jsx");

/**
 * Render the customer shell to HTML.
 *
 * The layout is an async Server Component, so it is rendered with
 * `react-dom/static`'s `prerender`, which awaits suspended work and returns
 * the markup as a stream.
 *
 * @returns {Promise<string>}
 */
async function render() {
  const { prelude } = await prerender(
    createElement(CustomerLayout, null, createElement("main", null, "catalogue")),
  );

  const chunks = [];
  const decoder = new TextDecoder();

  for await (const chunk of prelude) {
    chunks.push(typeof chunk === "string" ? chunk : decoder.decode(chunk));
  }

  return chunks.join("");
}

/**
 * @param {string} html
 * @param {string} needle
 * @returns {boolean}
 */
function has(html, needle) {
  return html.includes(needle);
}

beforeEach(() => {
  sessionState.session = null;
});

describe("customer Navbar — signed out", () => {
  it("shows Login and Register", async () => {
    const html = await render();

    expect(has(html, 'href="/login"')).toBe(true);
    expect(has(html, 'href="/register"')).toBe(true);
  });

  it("does not show a Log out control", async () => {
    const html = await render();

    expect(has(html, "Log out")).toBe(false);
  });

  it("renders the four unbuilt destinations as non-interactive spans", async () => {
    const html = await render();

    // A disabled-looking `<a href>` still lets keyboard and screen-reader
    // users activate a 404, so they must not be links at all.
    for (const dead of [
      "/app/subscriptions",
      "/app/orders",
      "/app/cart",
      "/app/account",
    ]) {
      expect(has(html, `href="${dead}"`)).toBe(false);
    }

    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the catalogue link live", async () => {
    expect(has(await render(), 'href="/app/products"')).toBe(true);
  });
});

describe("customer Navbar — signed in", () => {
  beforeEach(() => {
    sessionState.session = {
      id: "session-1",
      user: {
        id: "user-1",
        name: "Smoke Tester",
        email: "smoke@test.local",
        role: "customer",
        status: "active",
      },
    };
  });

  it("shows the user's name", async () => {
    expect(has(await render(), "Smoke Tester")).toBe(true);
  });

  it("shows a Log out control instead of Login and Register", async () => {
    const html = await render();

    expect(has(html, "Log out")).toBe(true);
    expect(has(html, 'href="/login"')).toBe(false);
    expect(has(html, 'href="/register"')).toBe(false);
  });
});

describe("customer Navbar — suspended user", () => {
  beforeEach(() => {
    sessionState.session = {
      id: "session-1",
      user: {
        id: "user-1",
        name: "Suspended Tester",
        email: "suspended@test.local",
        role: "customer",
        status: "suspended",
      },
    };
  });

  it("treats a suspended account as signed out", async () => {
    // The account is revoked at the next sign-in, but a session that is
    // already live must not keep rendering the signed-in Navbar.
    const html = await render();

    expect(has(html, 'href="/login"')).toBe(true);
    expect(has(html, "Log out")).toBe(false);
  });
});
