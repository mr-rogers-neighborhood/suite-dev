import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { stagedRecords } from "../../scripts/lib/installs.mjs";
import { launchStart } from "../fixtures/suite";

/**
 * The hub over the staged binaries.
 *
 * This is the check that cannot be made from source: Start reads the manifests
 * electron-builder put beside each executable, and the paths in `installs.json`
 * are the staged ones. A fake app proves routing; this proves the packaging.
 */
test("the staged hub lists the staged apps and their files", async () => {
  const root = await mkdtemp(join(tmpdir(), "suite-hub-"));
  await mkdir(join(root, "documents", "Canvas"), { recursive: true });
  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(join(root, "documents", "Canvas", "Demo.canvas"), "{}\n");
  await writeFile(
    join(root, "data", "installs.json"),
    JSON.stringify({ apps: await stagedRecords() }, null, 2),
  );

  const launched = await launchStart({ root });
  try {
    await expect(launched.page.locator("h1")).toHaveText("Suite", { timeout: 30_000 });
    await expect(launched.page.locator('li.card[data-app-id="canvas"]')).toBeVisible();
    await expect(launched.page.locator('li.card[data-app-id="planner"]')).toBeVisible();
    await expect(launched.page.locator('li.card[data-app-id="budget"]')).toBeVisible();
    await expect(launched.page.locator("#all-files")).toContainText("Demo.canvas");
  } finally {
    await launched.close();
    await rm(root, { recursive: true, force: true });
  }
});
