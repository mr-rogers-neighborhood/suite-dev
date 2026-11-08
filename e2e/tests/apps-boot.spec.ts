import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { launchStaged } from "../fixtures/suite";

/**
 * Every staged binary opens a window that actually renders.
 *
 * A missing production dependency, a broken `app://` resolver or a policy that
 * blocks the bundle all look the same to a boot check: the process stays alive
 * and the page is blank. This reads the page, so it fails when that happens.
 */
interface BootCase {
  readonly id: string;
  readonly marker: (page: Page) => ReturnType<Page["locator"]>;
  readonly env: (root: string) => Record<string, string>;
}

const CASES: readonly BootCase[] = [
  {
    id: "start",
    marker: (page) => page.locator("h1"),
    env: (root) => ({
      SUITE_START_USER_DATA: join(root, "user-data"),
      SUITE_START_DATA: join(root, "data"),
      SUITE_START_DOCUMENTS: join(root, "documents"),
    }),
  },
  {
    id: "canvas",
    marker: (page) =>
      page.locator('[data-testid="workspace-launcher"], [data-testid="desktop-recents"]').first(),
    env: (root) => ({
      SUITE_CANVAS_USER_DATA: join(root, "user-data"),
      SUITE_CANVAS_LIBRARY: join(root, "documents"),
    }),
  },
  {
    id: "planner",
    // A first run now lands on the start screen, so that is the rendered window to look for.
    marker: (page) => page.getByRole("heading", { name: "Suite Planner" }),
    env: (root) => ({
      SUITE_PLANNER_USER_DATA: join(root, "user-data"),
      SUITE_PLANNER_LIBRARY: join(root, "documents"),
    }),
  },
  {
    id: "budget",
    marker: (page) => page.getByRole("heading", { name: "Suite Budget" }),
    env: (root) => ({
      SUITE_BUDGET_USER_DATA: join(root, "user-data"),
      SUITE_BUDGET_LIBRARY: join(root, "documents"),
    }),
  },
];

for (const bootCase of CASES) {
  test(`${bootCase.id} opens a rendered window`, async () => {
    const root = await mkdtemp(join(tmpdir(), `suite-boot-${bootCase.id}-`));
    const launched = await launchStaged(bootCase.id, {
      root,
      env: bootCase.env(root),
    });
    try {
      await expect(bootCase.marker(launched.page)).toBeVisible({ timeout: 30_000 });
    } finally {
      await launched.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
