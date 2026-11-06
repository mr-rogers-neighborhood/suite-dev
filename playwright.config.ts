import { defineConfig } from "@playwright/test";

/**
 * The cross-app suite.
 *
 * It launches the staged binaries, so it needs `pnpm stage` first and a display.
 * Every spec is serial: the sync stories share a server port range and each one
 * owns a temp workspace, and a parallel run only makes the failures harder to
 * read.
 */
export default defineConfig({
  testDir: "./e2e/tests",
  globalSetup: "./e2e/fixtures/global-setup.ts",
  outputDir: "./.dev/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
