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

/**
 * The environment every launched app gets, so none of them can reach the real machine.
 *
 * Redirecting `XDG_DATA_HOME` alone was not enough, and the gap was not theoretical: an app
 * whose data directory is not overridden resolves it through Electron's `userData`, which on
 * Linux is `$XDG_CONFIG_HOME/<name>` — and with `XDG_CONFIG_HOME` unset that is the
 * developer's own config directory. A test hub was reading the real `installs.json`, listing
 * the real `~/Applications/Suite`, and offering to uninstall what it found there.
 *
 * So `HOME` and all four XDG roots move into the test's temp directory. Nothing under the
 * real home is reachable by anything the suite launches, whatever an app forgets to override.
 */
export function isolatedEnv(root: string): Record<string, string> {
  const home = join(root, "home");
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_CACHE_HOME: join(home, ".cache"),
  };
}

/**
 * Switches an Electron app needs when there is no real display behind it.
 *
 * Xvfb has no GPU, and Electron treats a GPU process that will not start as fatal, so every
 * app is launched with `--disable-gpu` in a headless run. The apps ignore arguments that begin
 * with a dash, so this cannot be mistaken for a document to open.
 */
export function headlessSwitches(): readonly string[] {
  return process.env.SUITE_E2E_HEADLESS === "1" ? ["--disable-gpu"] : [];
}

/**
 * Refuse to launch an app against a real profile.
 *
 * The failure this prevents is silent: a suite that reads and writes the developer's own
 * installs looks like a passing suite until it uninstalls something. A wrong `HOME` is
 * almost always a caller that forgot to pass one, so it is caught here rather than found
 * later as a card listing apps the test never installed.
 */
function assertIsolated(env: Readonly<Record<string, string | undefined>>, where: string): void {
  const home = env.HOME;
  if (home === undefined || !home.startsWith(tmpdir())) {
    throw new Error(
      `${where} would run against the real home directory (${home ?? "unset"}). ` +
        "Pass a temp root through `isolatedEnv(root)`.",
    );
  }
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
    args: [...headlessSwitches(), workspace.files[profile]],
    env: {
      ...process.env,
      ...isolatedEnv(workspace.root),
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
    args: [...headlessSwitches(), ...(options.args ?? [])],
    env: {
      ...process.env,
      ...isolatedEnv(options.root),
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
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
  const environment = {
    ...process.env,
    ...isolatedEnv(root),
    SUITE_START_USER_DATA: join(root, "user-data"),
    SUITE_START_DATA: join(root, "data"),
    SUITE_START_DOCUMENTS: join(root, "documents"),
    // The install root too, and not only the data directory: this is what the hub reads to
    // decide which apps exist and what it may replace. Left at its default it is the real
    // `~/Applications/Suite`, so a test hub listed the developer's own installs and stood
    // ready to update or uninstall them.
    SUITE_START_APPS_ROOT: join(root, "applications"),
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    ...env,
  };
  assertIsolated(environment, "launchStart");
  const app = await electron.launch({
    executablePath: startExecutable(),
    args: [...headlessSwitches(), ...files],
    env: environment,
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
