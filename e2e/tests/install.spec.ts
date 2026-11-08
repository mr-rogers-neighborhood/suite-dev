import { createHash, createPrivateKey, sign } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";

/**
 * Installing an app, and replacing it with a newer one.
 *
 * Everything the hub does to a file it installs is here, driven the way a person drives it:
 * a card offers Install, a press lands a binary, the card offers Update, a press replaces
 * it and the old version goes. The artifact is a **stand-in** — a shell script that prints
 * its version — because the thing under test is Start's handling of a file, not Electron's
 * ability to run one. A stand-in keeps this spec fast enough to run in every gate and free
 * of FUSE, a display, or a 150 MB download.
 *
 * The feed is real in every way that matters: a `latest-linux.yml` naming the artifact and
 * its sha512, signed with the publisher key, verified by the same code the hub ships. The
 * signature is what a relying party checks, so a stand-in signed by the real key exercises
 * exactly the path a real release takes.
 *
 * **It signs with `~/.config/suite/update-key.pem`, and skips loudly without it.** The hub
 * pins one public key; a test cannot invent a second one without shipping a hole that lets
 * anybody's feed be trusted. The `dist` drift check behaves the same way.
 */
const KEY_PATH =
  process.env.SUITE_UPDATE_KEY?.trim() || join(homedir(), ".config", "suite", "update-key.pem");

const APP_ID = "canvas";
const APP_NAME = "Suite Canvas";

interface StandIn {
  readonly version: string;
  readonly bytes: Buffer;
}

function standIn(version: string): StandIn {
  return { version, bytes: Buffer.from(`#!/bin/sh\necho "${APP_NAME} ${version}"\n`, "utf8") };
}

function sha512(bytes: Buffer): string {
  return createHash("sha512").update(bytes).digest("base64");
}

/** A feed directory holding one version, signed the way a release is signed. */
async function feedFor(root: string, artifact: StandIn, privateKey: Buffer): Promise<string> {
  const directory = join(root, "feed", APP_ID);
  await mkdir(directory, { recursive: true });

  const filename = `suite-${APP_ID}-${artifact.version}-x86_64.AppImage`;
  const manifest = [
    `version: ${artifact.version}`,
    "files:",
    `  - url: ${filename}`,
    `    sha512: ${sha512(artifact.bytes)}`,
    `    size: ${artifact.bytes.byteLength}`,
    `path: ${filename}`,
    `sha512: ${sha512(artifact.bytes)}`,
    "",
  ].join("\n");

  await writeFile(join(directory, filename), artifact.bytes);
  await writeFile(join(directory, "latest-linux.yml"), manifest);
  await writeFile(
    join(directory, "latest-linux.yml.sig"),
    `${sign(null, Buffer.from(manifest, "utf8"), createPrivateKey(privateKey)).toString("base64")}\n`,
  );
  return join(root, "feed");
}

interface Hub {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly card: ReturnType<Page["locator"]>;
  text(): Promise<string>;
  close(): Promise<void>;
}

async function launchHub(root: string, env: Record<string, string>): Promise<Hub> {
  const app = await electron.launch({
    executablePath: ".dev/apps/start/suite-start",
    env: {
      ...process.env,
      HOME: root,
      SUITE_START_USER_DATA: join(root, "user-data"),
      SUITE_START_DATA: join(root, "data"),
      SUITE_START_DOCUMENTS: join(root, "Documents"),
      SUITE_START_APPS_ROOT: join(root, "Applications", "Suite"),
      XDG_DATA_HOME: join(root, ".local", "share"),
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
      ...env,
    },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(`[data-app-id="${APP_ID}"]`, { timeout: 30_000 });
  const card = page.locator(`[data-app-id="${APP_ID}"]`);
  return {
    app,
    page,
    card,
    text: async () => (await card.innerText()).replace(/\s*\n\s*/gu, " | "),
    close: async () => {
      await app.close().catch(() => undefined);
    },
  };
}

const key = existsSync(KEY_PATH) ? await readFile(KEY_PATH) : null;

test.describe("installing and updating from a signed feed", () => {
  test.skip(
    key === null,
    `no publisher key at ${KEY_PATH}, so no feed can be signed that the hub would trust`,
  );

  test("a card installs a version, then replaces it and prunes the old one", async () => {
    const root = await mkdtemp(join(tmpdir(), "suite-install-spec-"));
    const appsRoot = join(root, "Applications", "Suite");

    try {
      // 1. A feed offering 0.1.0, and a hub with nothing installed.
      const first = await feedFor(root, standIn("0.1.0"), key as Buffer);
      let hub = await launchHub(root, { SUITE_START_FEED_BASE: first });

      expect(await hub.text()).toContain("Not installed yet");
      await hub.card.getByRole("button", { name: `Install ${APP_NAME}` }).click();
      await hub.card.getByRole("button", { name: "Open" }).waitFor({ timeout: 120_000 });

      expect(await hub.text()).toContain("0.1.0");
      expect(await readdir(join(appsRoot, "Canvas"))).toEqual(["0.1.0"]);
      const record = JSON.parse(await readFile(join(root, "data", "installs.json"), "utf8"));
      expect(record.apps[0].executable).toContain("0.1.0");

      // 2. A managed install earns a menu entry, so it can be opened without the hub.
      const entry = join(root, ".local", "share", "applications", `suite-${APP_ID}.desktop`);
      expect(await readFile(entry, "utf8")).toContain(`Exec="${join(appsRoot, "Canvas", "0.1.0")}`);
      await hub.close();

      // 3. A feed offering 0.1.1: the card should ask to update, and a press should replace.
      const second = await feedFor(root, standIn("0.1.1"), key as Buffer);
      hub = await launchHub(root, { SUITE_START_FEED_BASE: second });

      const update = hub.card.getByRole("button", { name: /^Update to 0\.1\.1/u });
      await update.waitFor({ timeout: 60_000 });
      expect(await hub.text()).toContain("newer version available");
      await update.click();
      await hub.card.getByRole("button", { name: "Open" }).waitFor({ timeout: 120_000 });

      // Replaced, and the version it replaced is gone rather than left beside it.
      expect(await readdir(join(appsRoot, "Canvas"))).toEqual(["0.1.1"]);
      const after = JSON.parse(await readFile(join(root, "data", "installs.json"), "utf8"));
      expect(after.apps[0].executable).toContain("0.1.1");
      expect(await hub.text()).toContain("0.1.1");
      await hub.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a feed that does not verify is refused, and nothing is written", async () => {
    const root = await mkdtemp(join(tmpdir(), "suite-install-spec-"));
    try {
      const feed = await feedFor(root, standIn("0.1.0"), key as Buffer);
      // One character appended to the manifest changes the bytes the signature covers.
      const manifest = join(feed, APP_ID, "latest-linux.yml");
      await writeFile(manifest, `${await readFile(manifest, "utf8")}releaseNotes: tampered\n`);

      const hub = await launchHub(root, { SUITE_START_FEED_BASE: feed });
      // No Install button: the hub offers only what a signature vouched for.
      expect(await hub.text()).toContain("No release found");
      expect(await hub.card.getByRole("button", { name: `Install ${APP_NAME}` }).count()).toBe(0);
      await expect(readdir(join(root, "Applications")).catch(() => [])).resolves.toEqual([]);
      await hub.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
