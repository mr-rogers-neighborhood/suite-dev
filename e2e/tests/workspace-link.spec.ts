import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { launchStaged, tempWorkspace } from "../fixtures/suite";

/**
 * A `suite://<app>/workspace/<name>` link, seen from the app's side.
 *
 * Start routes a link by launching the app with it as the first argument — the
 * half `route.test.ts` fixes on the hub side. This is the other half: the app
 * resolves the name against its own folder and opens that document, and a name it
 * does not have leaves the app on its normal first screen rather than failing.
 */

/**
 * What Canvas reports about the document it has open, if any.
 *
 * A link that resolves makes the app navigate from its launcher route to the workspace,
 * and an evaluate that lands mid-navigation has no context to run in. Waiting for the
 * bridge first makes the read land after the page has settled wherever it was going.
 */
async function canvasDocumentPath(page: Page): Promise<string | null> {
  await page
    .waitForFunction(() => (globalThis as { suiteDesktop?: unknown }).suiteDesktop !== undefined, {
      timeout: 30_000,
    })
    .catch(() => {});
  return page.evaluate(async () => {
    const bridge = (
      globalThis as { suiteDesktop?: { documentInfo(): Promise<{ path: string } | null> } }
    ).suiteDesktop;
    return (await bridge?.documentInfo())?.path ?? null;
  });
}

/** What Planner reports about the workspace it has open. */
async function plannerWorkspacePath(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const bridge = (globalThis as { suitePlanner?: { info(): Promise<{ path: string }> } })
      .suitePlanner;
    return (await bridge?.info())?.path ?? null;
  });
}

test("canvas opens the document a link names", async () => {
  const workspace = await tempWorkspace();
  const library = join(workspace.root, "owner", "Canvas");

  const launched = await launchStaged("canvas", {
    root: workspace.root,
    args: ["suite://canvas/workspace/Demo.canvas"],
    env: {
      SUITE_CANVAS_USER_DATA: join(workspace.root, "link-user-data"),
      SUITE_CANVAS_LIBRARY: library,
    },
  });

  try {
    await expect
      .poll(() => canvasDocumentPath(launched.page), { timeout: 30_000 })
      .toBe(join(library, "Demo.canvas"));
    // The launcher is what a link that resolved to nothing would leave behind, so
    // its absence is the difference this catches. (The title belongs to the
    // renderer once a workspace loads, so it is not a witness here.)
    await expect(launched.page.locator('[data-testid="workspace-launcher"]')).toHaveCount(0);
  } finally {
    await launched.close();
    await workspace.dispose();
  }
});

test("planner opens its own workspace when the link names one it does not have", async () => {
  const root = await mkdtemp(join(tmpdir(), "suite-link-planner-"));
  const launched = await launchStaged("planner", {
    root,
    args: ["suite://planner/workspace/gone.planner"],
    env: {
      SUITE_PLANNER_USER_DATA: join(root, "user-data"),
      // A folder with nothing in it: the name cannot resolve, and the app still
      // has to be usable.
      SUITE_PLANNER_LIBRARY: join(root, "documents"),
    },
  });

  try {
    // The link named a file that does not exist, so the app invents a workspace and shows the
    // start screen for it. Usable is the claim; a phantom document would not be.
    await expect(launched.page.getByRole("heading", { name: "Suite Planner" })).toBeVisible({
      timeout: 30_000,
    });
    const path = await plannerWorkspacePath(launched.page);
    expect(path).toContain("workspace.planner");
    expect(path).not.toContain("gone.planner");
  } finally {
    await launched.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("budget shows its library when the link names a budget it does not have", async () => {
  const root = await mkdtemp(join(tmpdir(), "suite-link-budget-"));
  const launched = await launchStaged("budget", {
    root,
    args: ["suite://budget/workspace/gone.budget"],
    env: {
      SUITE_BUDGET_USER_DATA: join(root, "user-data"),
      SUITE_BUDGET_LIBRARY: join(root, "documents"),
    },
  });

  try {
    await expect(launched.page.getByRole("heading", { name: "Suite Budget" })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await launched.close();
    await rm(root, { recursive: true, force: true });
  }
});
