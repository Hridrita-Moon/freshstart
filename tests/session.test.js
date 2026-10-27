import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_DAYS,
  SESSION_REFRESH_THRESHOLD_DAYS,
  createSession,
  destroyAllSessionsForUser,
  destroySession,
  generateSessionToken,
  getSessionByToken,
  hashSessionToken,
  maybeRefreshSession,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Session module tests.
 *
 * SRS §3.1: the raw token exists only in the cookie; the database stores its
 * SHA-256 hash. A database leak must therefore not expose usable tokens.
 */

let user;

beforeAll(async () => {
  user = await prisma.user.create({
    data: {
      email: "session.test@test.local",
      passwordHash: "x",
      name: "Session Tester",
      role: "customer",
    },
  });
});

afterAll(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("generateSessionToken", () => {
  it("produces a unique high-entropy token", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
  });

  it("produces a URL-safe token", () => {
    expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashSessionToken", () => {
  it("is deterministic", () => {
    expect(hashSessionToken("abc")).toBe(hashSessionToken("abc"));
  });

  it("produces a different hash for a different token", () => {
    expect(hashSessionToken("abc")).not.toBe(hashSessionToken("abd"));
  });

  it("never contains the raw token", () => {
    const token = "super-secret-token";
    expect(hashSessionToken(token)).not.toContain(token);
  });
});

describe("createSession", () => {
  it("stores only the hash, never the raw token", async () => {
    const { token, sessionId } = await createSession(user.id);
    const row = await prisma.session.findUnique({ where: { id: sessionId } });

    expect(row).not.toBeNull();
    expect(row.tokenHash).toBe(hashSessionToken(token));
    expect(row.tokenHash).not.toBe(token);
  });

  it("sets a 30-day expiry", async () => {
    const { sessionId } = await createSession(user.id);
    const row = await prisma.session.findUnique({ where: { id: sessionId } });

    const days =
      (row.expiresAt.getTime() - row.createdAt.getTime()) / (86_400_000);
    expect(days).toBeCloseTo(SESSION_MAX_AGE_DAYS, 1);
  });
});

describe("getSessionByToken", () => {
  it("resolves a valid token to its session and user", async () => {
    const { token } = await createSession(user.id);
    const session = await getSessionByToken(token);

    expect(session).not.toBeNull();
    expect(session.userId).toBe(user.id);
    expect(session.user.email).toBe("session.test@test.local");
  });

  it("returns null for an unknown token", async () => {
    expect(await getSessionByToken("not-a-real-token")).toBeNull();
  });

  it("returns null for a missing token", async () => {
    expect(await getSessionByToken(undefined)).toBeNull();
    expect(await getSessionByToken(null)).toBeNull();
    expect(await getSessionByToken("")).toBeNull();
  });

  it("deletes and rejects an expired session", async () => {
    const { token, sessionId } = await createSession(user.id);

    await prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await getSessionByToken(token)).toBeNull();

    const row = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(row).toBeNull();
  });
});

describe("maybeRefreshSession", () => {
  it("extends the expiry once more than half the lifetime has elapsed", async () => {
    const { sessionId } = await createSession(user.id);

    // Backdate `lastUsedAt` past the refresh threshold.
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        lastUsedAt: new Date(Date.now() - (SESSION_REFRESH_THRESHOLD_DAYS + 1) * 86_400_000),
        expiresAt: new Date(Date.now() + 1000),
      },
    });

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    const before = session.expiresAt.getTime();

    await maybeRefreshSession(session);

    const after = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(after.expiresAt.getTime()).toBeGreaterThan(before);
  });

  it("keeps the expiry but updates lastUsedAt when the window has not elapsed", async () => {
    const { sessionId } = await createSession(user.id);

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    const expiresAt = session.expiresAt.getTime();
    const lastUsedAt = session.lastUsedAt.getTime();

    await maybeRefreshSession(session);

    const after = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(after.expiresAt.getTime()).toBe(expiresAt);
    expect(after.lastUsedAt.getTime()).toBeGreaterThanOrEqual(lastUsedAt);
  });
});

describe("destroySession", () => {
  it("removes the session row so the cookie stops working", async () => {
    const { token, sessionId } = await createSession(user.id);

    await destroySession(token);

    expect(await prisma.session.findUnique({ where: { id: sessionId } })).toBeNull();
    expect(await getSessionByToken(token)).toBeNull();
  });

  it("is a no-op for a missing token", async () => {
    await expect(destroySession(undefined)).resolves.toBeUndefined();
  });
});

describe("destroyAllSessionsForUser", () => {
  it("removes every session for the user", async () => {
    await createSession(user.id);
    await createSession(user.id);
    await createSession(user.id);

    await destroyAllSessionsForUser(user.id);

    const remaining = await prisma.session.count({ where: { userId: user.id } });
    expect(remaining).toBe(0);
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly, sameSite lax and path-scoped to /", () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it("is not secure outside production", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    expect(sessionCookieOptions().secure).toBe(false);

    process.env.NODE_ENV = "production";
    expect(sessionCookieOptions().secure).toBe(true);

    process.env.NODE_ENV = original;
  });

  it("uses the fixed cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("ft_session");
  });
});
