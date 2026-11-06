import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The `suite-dev` repository root. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The folder the five repositories sit in. */
export const SIBLINGS_ROOT = resolve(ROOT, "..");

/** Everything a run creates. Gitignored, and never the user's real data. */
export const DEV = join(ROOT, ".dev");

export const ENV_FILE = join(DEV, "env.json");
export const APPS_DIR = join(DEV, "apps");
export const DATA_DIR = join(DEV, "data");
export const DOCUMENTS_DIR = join(DEV, "documents");
export const START_DATA_DIR = join(DEV, "start-data");
export const WORKSPACE_DIR = join(DEV, "workspace");
export const LOGS_DIR = join(DEV, "logs");
export const LINK_DIR = join(DEV, "link");
export const PID_DIR = join(DEV, "pids");

export function sibling(name) {
  return resolve(SIBLINGS_ROOT, name);
}

export function appDir(appId) {
  return join(APPS_DIR, appId);
}

export function profileDocuments(profile) {
  return join(DOCUMENTS_DIR, profile);
}

export function profileStartData(profile) {
  return join(START_DATA_DIR, profile);
}

export function profileUserData(appId, profile) {
  return join(DATA_DIR, `${appId}-${profile}`);
}

export async function ensureDevDirs() {
  await Promise.all(
    [DEV, APPS_DIR, DATA_DIR, DOCUMENTS_DIR, START_DATA_DIR, LOGS_DIR, PID_DIR].map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  );
}
