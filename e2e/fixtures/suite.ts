import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ElectronApplication, _electron as electron, type Page } from "@playwright/test";
import {
  canvasSchemaVersion,
  emptySnapshot,
  writeCanvasFile,
} from "../../scripts/lib/canvasFile.mjs";
import { hexId } from "../../scripts/lib/ids.mjs";
import { executableOf } from "../../scripts/lib/installs.mjs";
import { appById } from "../../scripts/lib/repos.mjs";

export interface TempWorkspace {
  readonly root: string;
  readonly workspaceId: string;
  /**
   * One copy of the workspace file per window.
   *
   * `restore` is not a person: it is a fresh install holding the same file, which is what a
   * machine rebuilt from a recovery file looks like.
   */
  readonly files: Record<"owner" | "editor" | "restore", string>;
  dispose(): Promise<void>;
}

/**
 * A workspace created for one test.
 *
 * The e2e suite does not reuse `.dev`: a card from the last run would make a
 * "did it open?" assertion pass before anything ran. A temp directory also gives
 * each test its own writer locks and its own userData.
 *
 * There is no server half any more. The hub hosts a workspace when a device joins it,
 * and a device needs a key this harness has no business inventing, so a test that wants
 * a relay starts the hub and joins one.
 */
export async function tempWorkspace(): Promise<TempWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "suite-e2e-"));
  const workspaceId = hexId();
  const schemaVersion = await canvasSchemaVersion();
  const snapshot = await emptySnapshot();
  const files = {} as Record<"owner" | "editor" | "restore", string>;

  for (const profile of ["owner", "editor", "restore"] as const) {
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
    files,
    dispose: async () => {
      const { rm } = await import("node:fs/promises");
      await rm(root, { recursive: true, force: true });
    },
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
  profile: "owner" | "editor" | "restore";
}): Promise<LaunchedApp> {
  const { workspace, profile } = options;
  const app = await electron.launch({
    executablePath: canvasExecutable(),
    args: [workspace.files[profile]],
    env: {
      ...process.env,
      // Two directories, and both are needed. `USER_DATA` is Electron's own — the single
      // instance lock lives there, so two copies of the shell need two of them or the second
      // quits. `DATA` is the document and sync state, and two windows sharing *that* would be
      // one device twice: the same identity, the same group, one owner marker between them.
      SUITE_CANVAS_USER_DATA: join(workspace.root, "user-data", profile),
      SUITE_CANVAS_DATA: join(workspace.root, "data", profile),
      SUITE_CANVAS_LIBRARY: join(workspace.root, profile, "Canvas"),
      // Shared with the hub, so the address it reports is the one these windows read. A test
      // never touches the real per-user data directory: every app resolves it through
      // `suitePaths`, which honours this.
      XDG_DATA_HOME: join(workspace.root, "data", "xdg"),
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

/**
 * Launch a staged app by id, with exactly the environment the caller gives it.
 *
 * Used by the boot check: every binary must open a window, because a missing
 * production dependency or a broken custom protocol shows up as a blank page
 * rather than an error.
 */
export async function launchStaged(
  id: string,
  options: {
    root: string;
    args?: readonly string[];
    env?: Record<string, string>;
  },
): Promise<LaunchedApp> {
  const app = appById(id);
  if (app === null) throw new Error(`unknown app ${id}`);
  const executable = executableOf(app);
  if (!existsSync(executable)) {
    throw new Error(`${id} is not staged (${executable}). Run \`pnpm apps:stage\` first.`);
  }
  const launched = await electron.launch({
    executablePath: executable,
    args: [...(options.args ?? [])],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
      // A test never reads or writes the real per-user data directory: every app
      // resolves it through `suitePaths`, which honours this. Without it a run
      // leaves its temp paths in the developer's own profile.
      XDG_DATA_HOME: join(options.root, "xdg-data"),
      ...options.env,
    },
    timeout: 60_000,
  });
  const page = await launched.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return {
    app: launched,
    page,
    close: async () => {
      await launched.close().catch(() => {});
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
