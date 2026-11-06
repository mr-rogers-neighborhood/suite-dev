import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type ElectronApplication, _electron as electron, type Page } from "@playwright/test";
import { canvasSchemaVersion, writeCanvasFile } from "../../scripts/lib/canvasFile.mjs";
import { hexId } from "../../scripts/lib/ids.mjs";
import { executableOf } from "../../scripts/lib/installs.mjs";
import { sibling } from "../../scripts/lib/paths.mjs";
import { findFreePort, waitForHttp } from "../../scripts/lib/ports.mjs";
import { startService } from "../../scripts/lib/proc.mjs";
import { appById } from "../../scripts/lib/repos.mjs";

const run = promisify(execFile);

export const SYNC_CLI = join(sibling("suite-sync"), "apps/server/dist/cli.js");

export interface TempWorkspace {
  readonly root: string;
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly editorId: string;
  readonly serverWorkspace: string;
  readonly snapshot: Uint8Array;
  readonly files: Record<"owner" | "editor", string>;
  dispose(): Promise<void>;
}

/**
 * A workspace created for one test.
 *
 * The e2e suite does not reuse `.dev`: a card from the last run would make a
 * "did it sync?" assertion pass before the transport ran. A temp directory also
 * gives each test its own writer locks and its own userData.
 */
export async function tempWorkspace(): Promise<TempWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "suite-e2e-"));
  const workspaceId = hexId();
  const ownerId = hexId();
  const editorId = hexId();
  const serverWorkspace = join(root, "workspace");

  await run(process.execPath, [
    SYNC_CLI,
    "workspace",
    "init",
    serverWorkspace,
    "--workspace",
    workspaceId,
    "--owner",
    ownerId,
    "--editor",
    editorId,
  ]);

  const snapshot = new Uint8Array(await readFile(join(serverWorkspace, "snapshot.loro")));
  const schemaVersion = await canvasSchemaVersion();
  const files = {} as Record<"owner" | "editor", string>;
  for (const profile of ["owner", "editor"] as const) {
    files[profile] = await writeCanvasFile({
      path: join(root, profile, "Canvas", "Demo.canvas"),
      workspaceId,
      snapshot,
      schemaVersion,
    });
  }

  return {
    root,
    workspaceId,
    ownerId,
    editorId,
    serverWorkspace,
    snapshot,
    files,
    dispose: async () => {
      const { rm } = await import("node:fs/promises");
      await rm(root, { recursive: true, force: true });
    },
  };
}

export interface RunningServer {
  readonly port: number;
  readonly socketUrl: string;
  readonly healthUrl: string;
  readonly handle: { stop(): void };
  stop(): void;
}

export async function startServer(workspace: TempWorkspace): Promise<RunningServer> {
  const port = await findFreePort(8790);
  const handle = startService({
    name: `sync-${port}`,
    command: process.execPath,
    args: [
      SYNC_CLI,
      "serve",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--workspace",
      workspace.serverWorkspace,
    ],
    cwd: sibling("suite-sync"),
  });

  const healthUrl = `http://127.0.0.1:${port}/health`;
  const ready = await waitForHttp(healthUrl, 15_000);
  if (!ready) {
    handle.stop();
    throw new Error(`suite-sync did not answer ${healthUrl}`);
  }
  return {
    port,
    socketUrl: `ws://127.0.0.1:${port}/sync`,
    healthUrl,
    handle,
    stop: () => handle.stop(),
  };
}

export function canvasExecutable(): string {
  const canvas = appById("canvas");
  const executable = executableOf(canvas);
  if (!existsSync(executable)) {
    throw new Error(`Canvas is not staged (${executable}). Run \`pnpm apps:stage\` first.`);
  }
  return executable;
}

export function startExecutable(): string {
  const start = appById("start");
  const executable = executableOf(start);
  if (!existsSync(executable)) {
    throw new Error(`Start is not staged (${executable}). Run \`pnpm apps:stage\` first.`);
  }
  return executable;
}

export interface LaunchedApp {
  readonly app: ElectronApplication;
  readonly page: Page;
  close(): Promise<void>;
}

export async function launchCanvas(options: {
  workspace: TempWorkspace;
  profile: "owner" | "editor";
  port: number;
  memberId: string;
}): Promise<LaunchedApp> {
  const { workspace, profile, port, memberId } = options;
  const app = await electron.launch({
    executablePath: canvasExecutable(),
    args: [workspace.files[profile]],
    env: {
      ...process.env,
      SUITE_CANVAS_USER_DATA: join(workspace.root, "data", profile),
      SUITE_CANVAS_LIBRARY: join(workspace.root, profile, "Canvas"),
      SUITE_SYNC_URL: `ws://127.0.0.1:${port}/sync`,
      SUITE_SYNC_MEMBER: memberId,
      SUITE_SYNC_WORKSPACE: workspace.workspaceId,
      SUITE_SYNC_EPOCH: "1",
      SUITE_SYNC_DEVICE: memberId,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return {
    app,
    page,
    close: async () => {
      await app.close().catch(() => {});
    },
  };
}

export async function launchStart(options: {
  root: string;
  files?: readonly string[];
  env?: Record<string, string>;
}): Promise<LaunchedApp> {
  const { root, files = [], env = {} } = options;
  const app = await electron.launch({
    executablePath: startExecutable(),
    args: [...files],
    env: {
      ...process.env,
      SUITE_START_USER_DATA: join(root, "user-data"),
      SUITE_START_DATA: join(root, "data"),
      SUITE_START_DOCUMENTS: join(root, "documents"),
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
      ...env,
    },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  return {
    app,
    page,
    close: async () => {
      await app.close().catch(() => {});
    },
  };
}

/** The "new card" gesture: the dock button, then the first menu entry (a note). */
export async function createNote(page: Page, title: string): Promise<void> {
  await page.locator('[data-testid="dock-new-card"]').click();
  await page.getByRole("menuitem", { name: "Note" }).click();
  const titleBox = page.getByRole("textbox", { name: "Card title" });
  await titleBox.waitFor({ state: "visible", timeout: 15_000 });
  await titleBox.fill(title);
  await page.keyboard.press("Escape");
}
