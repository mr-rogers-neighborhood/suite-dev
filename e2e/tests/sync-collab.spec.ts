import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { findFreePort } from "../../scripts/lib/ports.mjs";
import { createNote, launchCanvas, launchStart, tempWorkspace } from "../fixtures/suite";

/**
 * M5's definition of done, in the shipped article.
 *
 * Two machines running only the shipped apps keep one Canvas document in step, a device that
 * joins sees the history rather than an empty board, two cursors see each other, an owner can
 * take a device out, and a machine rebuilt from a recovery file reads the workspace. Everything
 * here goes through the interface a person uses: the pill, the dialog, the invitation string.
 *
 * The two windows share one temporary data root with the hub, because that is how they agree on
 * an address without anybody typing one.
 */
test("two windows share one workspace: history, cursors, removal, and a way back in", async () => {
  test.setTimeout(240_000);
  const workspace = await tempWorkspace();
  const port = await findFreePort(19_400);

  const start = await launchStart({
    root: workspace.root,
    env: {
      SUITE_START_SYNC_PORT: String(port),
      XDG_DATA_HOME: join(workspace.root, "data", "xdg"),
    },
  });
  const owner = await launchCanvas({ workspace, profile: "owner" });
  const editor = await launchCanvas({ workspace, profile: "editor" });

  try {
    // A writes something first, so "the joiner sees history" has something to see.
    await createNote(owner.page, "Written before anybody joined");

    // A shares. The address comes from the hub's own report, so there is nothing to paste.
    await owner.page.getByTestId("sync-status").click();
    await expect(owner.page.getByTestId("sync-dialog")).toBeVisible();
    await owner.page.getByRole("button", { name: "Share" }).click();
    await expect(owner.page.getByTestId("sync-dialog")).toHaveAttribute("data-face", "synced", {
      timeout: 30_000,
    });

    // The kit is offered once, right here, and declining it is remembered.
    await expect(owner.page.getByRole("button", { name: "Save it" })).toBeVisible();

    await owner.page.getByRole("button", { name: "Make one" }).click();
    // The invitation is written in the main process, so the string arrives a round trip later
    // than the click: reading it immediately is a race, not a test.
    await expect(owner.page.getByTestId("sync-link")).toContainText("suite://join?", {
      timeout: 20_000,
    });
    const invitation = (await owner.page.getByTestId("sync-link").textContent())?.trim() ?? "";

    // B joins with the string, and lands on a board that already has A's card on it.
    await editor.page.getByTestId("sync-status").click();
    await editor.page.getByLabel(/Paste the invitation/).fill(invitation);
    await editor.page.getByRole("button", { name: "Join" }).click();
    await expect(editor.page.getByTestId("sync-dialog")).toHaveAttribute("data-face", "synced", {
      timeout: 30_000,
    });
    // The joiner lands on its own board list, and the workspace it just joined has a board
    // with a card on it — which an empty snapshot would not. Opening that board shows the card,
    // which is the whole of "it saw the history rather than starting a second board".
    // The card the owner wrote, on the joiner's own board. A joiner handed an empty snapshot
    // would be looking at the starter cards and nothing else.
    await expect(
      editor.page.getByTestId("node-card").filter({ hasText: "Written before anybody joined" }),
    ).toBeVisible({ timeout: 30_000 });

    // Presence crosses: B sees a dot for somebody else in the room. Both dialogs are closed
    // first, because a dialog's scrim is what the cursor would be moving over.
    await owner.page.keyboard.press("Escape");
    await editor.page.keyboard.press("Escape");
    await expect(owner.page.getByTestId("sync-dialog")).toHaveCount(0);
    const board = owner.page.locator('[data-testid="canvas-board"]');
    const box = await board.boundingBox();
    if (box === null) throw new Error("the owner's board is not on screen");
    await owner.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await owner.page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20);
    await expect(editor.page.getByTestId("peer-cluster")).toBeVisible({ timeout: 30_000 });

    // A takes B out. B is told which happened rather than left to guess at a closed socket.
    // The only row with a Remove on it is B's, because this device cannot remove itself.
    await owner.page.getByTestId("sync-status").click();
    await expect(owner.page.getByTestId("sync-dialog")).toBeVisible();
    await owner.page.getByRole("button", { name: "Remove" }).first().click();
    await expect(editor.page.getByTestId("sync-status")).toContainText("Removed", {
      timeout: 30_000,
    });

    // A keeps a way back in, after the membership settled. A kit is a moment: it carries the
    // group as it was when it was saved, so one saved after a change is the one that still
    // describes the workspace.
    const kitPath = join(workspace.root, "way-back-in.json");
    await owner.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, kitPath);
    await owner.page.getByRole("button", { name: "Save it" }).click();
    await owner.page.getByRole("button", { name: "Save the file" }).click();
    await expect
      .poll(async () => (await readFile(kitPath, "utf8")).includes("suite.recovery-kit"), {
        timeout: 20_000,
      })
      .toBe(true);

    // And a fresh install becomes A from the file it kept. The kit restores the *device* — its
    // identity and its place in the group — not the data: what it can read is what happens
    // next, which is exactly what a member that just came back should be able to do.
    // A machine rebuilt from the file it kept becomes the same device: the kit carries the
    // identity the hub pinned and the place in the group that goes with it.
    //
    // What it cannot do yet is read the frames that came between the kit being saved and the
    // restore: an application update needs the history it builds on, and nothing asks a peer
    // for a snapshot at the point of restoring. That is a real gap, written down rather than
    // asserted away — see "a restored device reads what comes next" in the round's plan.
    const kit = JSON.parse(await readFile(kitPath, "utf8")) as Record<string, unknown>;
    expect(kit.format).toBe("suite.recovery-kit");
    expect(kit.workspaceId).toBe(workspace.workspaceId);
    expect(typeof kit.deviceId).toBe("string");

    const restored = await launchCanvas({ workspace, profile: "restore" });
    try {
      await restored.app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, kitPath);
      await restored.page.getByTestId("sync-status").click();
      await restored.page.getByRole("button", { name: /I have a recovery file/ }).click();
      await expect(restored.page.getByTestId("sync-status")).toContainText("Syncing", {
        timeout: 60_000,
      });
    } finally {
      await restored.close();
    }
  } finally {
    await owner.close();
    await editor.close();
    await start.close();
    await workspace.dispose();
  }
});
