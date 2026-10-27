import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads modules in development. Without caching the client on
 * `globalThis`, every reload would open a new connection pool and eventually
 * exhaust the SQLite connection limit.
 */
const globalForPrisma = globalThis;

/** @type {PrismaClient | undefined} */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
