import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/auth/register/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";

/**
 * Integration tests for `POST /api/auth/register`.
 *
 * SRS §14.1: these run against the dedicated `dev.test.db` SQLite file with
 * migrations applied by the global setup. Prisma is real, not mocked.
 *
 * The route reaches the session module, which imports `next/headers`. That
 * module is mocked here so the handler can be invoked outside a request
 * scope — the register route never reads cookies, it only writes them.
 */
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}));

/**
 * Build a `Request` with a JSON body.
 *
 * @param {unknown} body
 * @returns {Request}
 */
function jsonRequest(body) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "user-agent": "vitest",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Build a `Request` whose body is not valid JSON.
 *
 * @returns {Request}
 */
function malformedRequest() {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not json",
  });
}

const REGISTERED_EMAIL = "register.test@test.local";

/**
 * The suite shares one SQLite file with the other integration tests, so
 * assertions count only the rows a given request could have created rather
 * than the whole `User` table.
 */
const OTHER_EMAIL = "alice@example.com";

beforeEach(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany({
    where: { email: { in: [REGISTERED_EMAIL, OTHER_EMAIL] } },
  });
});

afterAll(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("creates a customer account and returns 201", async () => {
    const response = await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: REGISTERED_EMAIL,
        password: "tomatoes",
      }),
    );

    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.email).toBe(REGISTERED_EMAIL);
    expect(body.data.name).toBe("Alice Rahman");
    expect(body.data.role).toBe("customer");
    expect(typeof body.data.id).toBe("string");
    expect(body.error).toBeUndefined();
  });

  it("stores a bcrypt hash rather than the plaintext", async () => {
    await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: REGISTERED_EMAIL,
        password: "tomatoes",
      }),
    );

    const user = await prisma.user.findUnique({
      where: { email: REGISTERED_EMAIL },
    });

    expect(user).not.toBeNull();
    expect(user.passwordHash).not.toBe("tomatoes");
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.role).toBe("customer");
    expect(user.status).toBe("active");
  });

  it("sets the ft_session cookie as httpOnly and SameSite=Lax", async () => {
    const response = await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: REGISTERED_EMAIL,
        password: "tomatoes",
      }),
    );

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
  });

  it("creates a session row for the new user", async () => {
    const response = await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: REGISTERED_EMAIL,
        password: "tomatoes",
      }),
    );

    const body = await response.json();
    const sessions = await prisma.session.findMany({
      where: { userId: body.data.id },
    });

    expect(sessions).toHaveLength(1);
    // The raw token never reaches the database — only its SHA-256 hash.
    expect(sessions[0].tokenHash).not.toContain(
      response.headers.get("set-cookie").split("=")[1].split(";")[0],
    );
  });

  it("normalises the email to lower case and trims whitespace", async () => {
    const response = await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: "  Alice@Example.COM  ",
        password: "tomatoes",
      }),
    );

    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.data.email).toBe("alice@example.com");

    const user = await prisma.user.findUnique({
      where: { email: "alice@example.com" },
    });
    expect(user).not.toBeNull();
  });

  it("rejects a duplicate email with 409 conflict and creates no second user", async () => {
    const payload = {
      name: "Alice Rahman",
      email: REGISTERED_EMAIL,
      password: "tomatoes",
    };

    const first = await POST(jsonRequest(payload));
    expect(first.status).toBe(201);

    const second = await POST(jsonRequest(payload));
    expect(second.status).toBe(409);

    const body = await second.json();
    expect(body.error.code).toBe("conflict");
    // The form renders `details.issues[]` per input, so a duplicate email
    // must arrive as a field-level issue — not only a banner.
    expect(Array.isArray(body.error.details.issues)).toBe(true);
    expect(
      body.error.details.issues.some((issue) => issue.path === "email"),
    ).toBe(true);

    const count = await prisma.user.count({
      where: { email: REGISTERED_EMAIL },
    });
    expect(count).toBe(1);
  });

  it("stamps lastLoginAt, because registration is a first sign-in", async () => {
    await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: REGISTERED_EMAIL,
        password: "tomatoes",
      }),
    );

    const user = await prisma.user.findUnique({
      where: { email: REGISTERED_EMAIL },
    });

    expect(user).not.toBeNull();
    expect(user.lastLoginAt).not.toBeNull();
  });

  it("stores the password exactly as submitted, without trimming it", async () => {
    // `login/route.js` reads the submitted password raw. If the register
    // route trimmed it, the stored hash would not match what the visitor
    // later types and the account could never be used.
    const padded = "  tomatoes  ";

    await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: REGISTERED_EMAIL,
        password: padded,
      }),
    );

    const user = await prisma.user.findUnique({
      where: { email: REGISTERED_EMAIL },
    });

    expect(user).not.toBeNull();
    // The padded password verifies; the trimmed one does not.
    expect(await verifyPassword(padded, user.passwordHash)).toBe(true);
    expect(await verifyPassword("tomatoes", user.passwordHash)).toBe(false);
  });

  it("rejects a missing email with 422 and a field-level issue", async () => {
    const response = await POST(
      jsonRequest({ name: "Alice Rahman", password: "tomatoes" }),
    );

    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error.code).toBe("validation_failed");
    expect(Array.isArray(body.error.details.issues)).toBe(true);
    expect(
      body.error.details.issues.some((issue) => issue.path === "email"),
    ).toBe(true);

    // No row was written for the address that was sent.
    const count = await prisma.user.count({
      where: { email: REGISTERED_EMAIL },
    });
    expect(count).toBe(0);
  });

  it("rejects a malformed email with 422 and a field-level issue", async () => {
    const response = await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: "not-an-email",
        password: "tomatoes",
      }),
    );

    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error.code).toBe("validation_failed");
    expect(
      body.error.details.issues.some((issue) => issue.path === "email"),
    ).toBe(true);

    const count = await prisma.user.count({
      where: { email: "not-an-email" },
    });
    expect(count).toBe(0);
  });

  it("rejects a password shorter than eight characters with 422", async () => {
    const response = await POST(
      jsonRequest({
        name: "Alice Rahman",
        email: REGISTERED_EMAIL,
        password: "1234567",
      }),
    );

    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error.code).toBe("validation_failed");
    expect(
      body.error.details.issues.some((issue) => issue.path === "password"),
    ).toBe(true);

    // One issue per field — the same rule must not be reported twice.
    expect(
      body.error.details.issues.filter((issue) => issue.path === "password"),
    ).toHaveLength(1);

    const count = await prisma.user.count({
      where: { email: REGISTERED_EMAIL },
    });
    expect(count).toBe(0);
  });

  it("rejects a body that is not valid JSON with 422", async () => {
    const response = await POST(malformedRequest());

    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.error.code).toBe("validation_failed");
  });
});
