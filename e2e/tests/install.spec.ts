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
import { headlessSwitches, isolatedEnv } from "../fixtures/suite";

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

/** The digest of a file, for asking "is this the same picture?" without decoding it. */
async function digest(path: string): Promise<string> {
  return sha512(await readFile(path));
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
    args: [...headlessSwitches()],
    env: {
      ...process.env,
      ...isolatedEnv(root),
      SUITE_START_USER_DATA: join(root, "user-data"),
      SUITE_START_DATA: join(root, "data"),
      SUITE_START_DOCUMENTS: join(root, "documents"),
      SUITE_START_APPS_ROOT: join(root, "Applications", "Suite"),
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

/**
 * The home directory the launched hub sees.
 *
 * Not the test's `root`: every app is given a private `HOME` (see `isolatedEnv`), so the
 * paths the hub writes to — menu entries, icons — live under that copy, not beside it.
 */
function childHome(root: string): string {
  return join(root, "home");
}

const key = existsSync(KEY_PATH) ? await readFile(KEY_PATH) : null;

test.describe("installing and updating from a signed feed", () => {
  test.skip(
    key === null,
    `no publisher key at ${KEY_PATH}, so no feed can be signed that the hub would trust`,
  );

  test("a card installs a version, replaces it, and offers the way back", async () => {
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
      const entry = join(
        childHome(root),
        ".local",
        "share",
        "applications",
        `suite-${APP_ID}.desktop`,
      );
      expect(await readFile(entry, "utf8")).toContain(`Exec="${join(appsRoot, "Canvas", "0.1.0")}`);

      // …and an icon that is the app's own. Every app used to get the hub's mark copied
      // under its name, which is indistinguishable from "the icon did not work".
      const installedIcon = join(
        childHome(root),
        ".local",
        "share",
        "icons",
        "hicolor",
        "256x256",
        "apps",
        `suite-${APP_ID}.png`,
      );
      const shipped = join(".dev", "apps", "start", "resources");
      expect(await digest(installedIcon)).toBe(
        await digest(join(shipped, "icons", `${APP_ID}.png`)),
      );
      expect(await digest(installedIcon)).not.toBe(await digest(join(shipped, "icon.png")));

      // 2b. Settings says where everything is, so leaving does not require guesswork.
      await hub.page.getByRole("tab", { name: "Settings" }).click();
      const settings = await hub.page.locator("#panel-settings").innerText();
      expect(settings).toContain(join(appsRoot, "Canvas", "0.1.0"));
      expect(settings).toContain(join(root, "documents", "Canvas"));
      await hub.page.getByRole("tab", { name: "Apps" }).click();
      await hub.close();

      // 3. A feed offering 0.1.1: the card should ask to update, and a press should replace.
      const second = await feedFor(root, standIn("0.1.1"), key as Buffer);
      hub = await launchHub(root, { SUITE_START_FEED_BASE: second });

      const update = hub.card.getByRole("button", { name: /^Update to 0\.1\.1/u });
      await update.waitFor({ timeout: 60_000 });
      expect(await hub.text()).toContain("newer version available");
      await update.click();
      await hub.card.getByRole("button", { name: "Open" }).waitFor({ timeout: 120_000 });

      // Replaced, and exactly one version kept: the one to go back to. A history would be a
      // package manager; one step back is what makes a bad update a button.
      expect(await readdir(join(appsRoot, "Canvas"))).toEqual(["0.1.0", "0.1.1"]);
      const after = JSON.parse(await readFile(join(root, "data", "installs.json"), "utf8"));
      expect(after.apps[0].executable).toContain("0.1.1");
      expect(await hub.text()).toContain("0.1.1");

      // 4. And the way back: the card offers the version it replaced, and pressing it moves
      //    the record to a binary this machine already has.
      const back = hub.card.getByRole("button", { name: "Roll back to 0.1.0" });
      await back.waitFor({ timeout: 30_000 });
      await back.click();

      // Two writes, so two polls: the record is what a launch reads, and the entry is what
      // the desktop reads. Asserting either one without waiting is a race, not a test.
      await expect
        .poll(
          async () => {
            const record = JSON.parse(await readFile(join(root, "data", "installs.json"), "utf8"));
            return record.apps[0].executable;
          },
          { timeout: 30_000 },
        )
        .toContain("0.1.0");
      await expect
        .poll(async () => readFile(entry, "utf8"), { timeout: 30_000 })
        .toContain(`Exec="${join(appsRoot, "Canvas", "0.1.0")}`);

      // Nothing was deleted on the way back, so the return trip is still offered.
      expect(await readdir(join(appsRoot, "Canvas"))).toEqual(["0.1.0", "0.1.1"]);
      await hub.card
        .getByRole("button", { name: "Roll back to 0.1.1" })
        .waitFor({ timeout: 30_000 });
      await expect(back).toHaveCount(0);
      await hub.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("uninstall leaves nothing behind, and takes no document", async () => {
    const root = await mkdtemp(join(tmpdir(), "suite-uninstall-spec-"));
    const appsRoot = join(root, "Applications", "Suite");
    const documents = join(root, "documents", "Canvas");

    try {
      // A document is the one thing Start must never touch, so one is present throughout.
      await mkdir(documents, { recursive: true });
      const document = join(documents, "Kept.canvas");
      await writeFile(document, "a file this hub has no business deleting");

      const feed = await feedFor(root, standIn("0.1.0"), key as Buffer);
      const hub = await launchHub(root, { SUITE_START_FEED_BASE: feed });

      await hub.card.getByRole("button", { name: `Install ${APP_NAME}` }).click();
      await hub.card.getByRole("button", { name: "Open" }).waitFor({ timeout: 120_000 });

      const entry = join(
        childHome(root),
        ".local",
        "share",
        "applications",
        `suite-${APP_ID}.desktop`,
      );
      const icon = join(
        childHome(root),
        ".local",
        "share",
        "icons",
        "hicolor",
        "256x256",
        "apps",
        `suite-${APP_ID}.png`,
      );
      expect(existsSync(entry)).toBe(true);
      expect(existsSync(icon)).toBe(true);

      // The confirmation is a native dialog, which no page can press. Answer it here, in the
      // main process, the way the person would — "Uninstall" is button 1.
      await hub.app.evaluate(({ dialog }) => {
        dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as never;
      });
      await hub.card.getByRole("button", { name: "Uninstall" }).click();

      // Every trace of the install goes: the bytes, the entry, the icon, the record.
      await expect
        .poll(() => existsSync(join(appsRoot, "Canvas")), { timeout: 30_000 })
        .toBe(false);
      await expect.poll(() => existsSync(entry), { timeout: 30_000 }).toBe(false);
      await expect.poll(() => existsSync(icon), { timeout: 30_000 }).toBe(false);
      const record = JSON.parse(await readFile(join(root, "data", "installs.json"), "utf8"));
      expect(record.apps).toEqual([]);

      // …and the document is still exactly where it was.
      expect(await readFile(document, "utf8")).toBe("a file this hub has no business deleting");
      await hub.card
        .getByRole("button", { name: `Install ${APP_NAME}` })
        .waitFor({ timeout: 30_000 });
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
