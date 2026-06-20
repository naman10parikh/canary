import { defineConfig } from "vitest/config";

// Scope unit/integration tests to tests/. eval/ is the eval-pyramid's territory (E19) and
// is run by `canary eval`, not vitest, so it is excluded here to avoid double-ownership.
export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.ts"],
    exclude: ["eval/**", "node_modules/**", "dist/**"],
    environment: "node",
  },
});
