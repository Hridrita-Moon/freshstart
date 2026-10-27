import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Integration tests share one SQLite file; they must not run concurrently
    // with each other or they will collide on the same rows.
    fileParallelism: false,
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.js", "src/app/api/**/*.js"],
      exclude: ["src/lib/prisma.js", "**/node_modules/**"],
      thresholds: {
        // SRS §14.1 sets an 80% line-coverage target on *services*. The
        // thresholds are scoped to the domain logic that target refers to,
        // rather than to route handlers (covered end-to-end by
        // `tests/smoke.mjs`) or the generic validation toolkit.
        "src/lib/services/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        "src/lib/decay/**": {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias,
  },
});
