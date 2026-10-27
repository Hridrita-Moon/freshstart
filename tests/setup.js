/**
 * Global Vitest setup.
 *
 * SRS §14.1: integration tests run against a dedicated `dev.test.db` SQLite
 * file, never the developer database. The Prisma client is pointed at that
 * file via `DATABASE_URL` before any module imports `@/lib/prisma`, so the
 * same code path is exercised locally and in CI.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDbPath = path.join(rootDir, "prisma", "dev.test.db");

// `file:` URLs are resolved relative to the schema location by Prisma, so the
// URL mirrors the dev URL shape exactly.
process.env.DATABASE_URL = "file:./dev.test.db";

// Keep deterministic time-zone handling in tests regardless of host locale.
process.env.TZ = "Asia/Dhaka";

if (existsSync(testDbPath)) {
  rmSync(testDbPath, { force: true });
}
mkdirSync(path.dirname(testDbPath), { recursive: true });

// Apply migrations to the fresh test database once per run.
//
// The Prisma CLI is invoked through its JS entry point rather than `npx`, so
// this works the same way on Windows, macOS and Linux without depending on
// shell shims (`npx.cmd` cannot be spawned directly with `execFileSync`).
const prismaCli = path.join(rootDir, "node_modules", "prisma", "build", "index.js");

execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  cwd: rootDir,
  stdio: "ignore",
  env: { ...process.env, DATABASE_URL: "file:./dev.test.db" },
});
