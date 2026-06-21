import { defineConfig } from "vitest/config";

// Scope unit/integration tests to tests/. eval/ is the eval-pyramid's territory (E19) and is run
// by `canary eval`, not vitest. tests/e2e/ is Playwright's territory (G29) — its specs import
// `@playwright/test`, so they must be excluded here to avoid double-ownership / a broken collect.
export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.ts"],
    exclude: ["eval/**", "tests/e2e/**", "node_modules/**", "dist/**"],
    environment: "node",
  },
});
