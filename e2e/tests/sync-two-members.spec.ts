import { expect, test } from "@playwright/test";
import {
  createNote,
  type LaunchedApp,
  launchCanvas,
  startServer,
  tempWorkspace,
} from "../fixtures/suite";

/**
 * Two real Canvas copies, one workspace, one server.
 *
 * The title is the assertion rather than "a card exists": both windows seed a
 * board of their own on first open, so a count would pass before the transport
 * did anything.
 */
test("a card created by the owner appears for the editor", async () => {
  const workspace = await tempWorkspace();
  const server = await startServer(workspace);
  let owner: LaunchedApp | null = null;
  let editor: LaunchedApp | null = null;

  try {
    owner = await launchCanvas({
      workspace,
      profile: "owner",
      port: server.port,
      memberId: workspace.ownerId,
    });
    editor = await launchCanvas({
      workspace,
      profile: "editor",
      port: server.port,
      memberId: workspace.editorId,
    });

    await expect(owner.page.locator('[data-testid="dock-new-card"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(editor.page.locator('[data-testid="dock-new-card"]')).toBeVisible({
      timeout: 30_000,
    });

    await createNote(owner.page, "E2E synced card");

    await expect(editor.page.getByText("E2E synced card")).toBeVisible({ timeout: 30_000 });

    const health = await fetch(server.healthUrl).then((response) => response.json());
    expect(health.clients).toBeGreaterThanOrEqual(2);
  } finally {
    await owner?.close();
    await editor?.close();
    server.stop();
    await workspace.dispose();
  }
});

test("a server restart keeps the document", async () => {
  const workspace = await tempWorkspace();
  const first = await startServer(workspace);
  let owner: LaunchedApp | null = null;
  let editor: LaunchedApp | null = null;
  let second: Awaited<ReturnType<typeof startServer>> | null = null;

  try {
    owner = await launchCanvas({
      workspace,
      profile: "owner",
      port: first.port,
      memberId: workspace.ownerId,
    });
    await expect(owner.page.locator('[data-testid="dock-new-card"]')).toBeVisible({
      timeout: 30_000,
    });
    await createNote(owner.page, "E2E survived restart");
    await owner.close();
    owner = null;
    first.stop();
    await new Promise((resolve) => setTimeout(resolve, 500));

    second = await startServer(workspace);
    editor = await launchCanvas({
      workspace,
      profile: "editor",
      port: second.port,
      memberId: workspace.editorId,
    });
    await expect(editor.page.getByText("E2E survived restart")).toBeVisible({ timeout: 30_000 });
  } finally {
    await owner?.close();
    await editor?.close();
    second?.stop();
    first.stop();
    await workspace.dispose();
  }
});
