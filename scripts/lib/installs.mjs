import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { APPS_DIR, appDir, profileStartData } from "./paths.mjs";
import { APPS } from "./repos.mjs";

/**
 * The executable inside a staged app directory.
 *
 * A Linux or Windows build is a folder with the binary in it. A macOS build is
 * an `.app` bundle, and the binary is inside `Contents/MacOS`.
 */
export function executableOf(app, directory = appDir(app.id)) {
  const bundle = join(directory, "Contents", "MacOS", app.executable);
  return existsSync(bundle) ? bundle : join(directory, app.executable);
}

export function manifestOf(app, directory = appDir(app.id)) {
  return join(directory, "suite.app.json");
}

/** The install records Start would write when a person picked each executable. */
export async function stagedRecords() {
  const records = [];
  for (const app of APPS) {
    // The hub is not an app it lists. A record for it would have no manifest
    // beside the binary, and discovery would report a refused install.
    if (app.id === "start") continue;
    const directory = appDir(app.id);
    if (!existsSync(directory)) continue;
    const executable = executableOf(app, directory);
    if (!existsSync(executable)) continue;
    records.push({
      id: app.id,
      executable,
      ...(app.manifest ? { manifestPath: manifestOf(app, directory) } : {}),
      installedAt: new Date().toISOString(),
    });
  }
  return records;
}

/**
 * Write `installs.json` for one Start profile.
 *
 * Start's own data directory is the only place an executable path lives, which
 * is the rule this harness leans on: staging does not teach Start about a dev
 * mode, it just writes the record an install would have written.
 */
export async function writeInstalls(profile, records) {
  const directory = profileStartData(profile);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "installs.json"),
    `${JSON.stringify({ apps: records }, null, 2)}\n`,
  );
  return join(directory, "installs.json");
}

/** Which app ids have a staged directory, for `doctor` and `seed`. */
export async function stagedAppIds() {
  try {
    const entries = await readdir(APPS_DIR, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}
