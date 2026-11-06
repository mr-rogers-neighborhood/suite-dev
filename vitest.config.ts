import { defineConfig } from "vitest/config";

/**
 * The harness's own unit tests. They cover the pure parts: id generation, the
 * `.dev/env` shape, the installs.json writer and the port helper. Anything that
 * launches an app belongs in the Playwright suite instead.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.mjs"],
    testTimeout: 15_000,
  },
});
