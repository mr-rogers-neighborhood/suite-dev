import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { hexId } from "./ids.mjs";
import { ENV_FILE } from "./paths.mjs";

/**
 * The suite's demo ids and ports, generated once and reused.
 *
 * They are stable across runs on purpose: a reload must rejoin the same room,
 * and a second terminal must be able to read the same numbers. `pnpm seed
 * --force` is the way to start over with new ids.
 */
export function newEnv() {
  return {
    version: 1,
    epoch: 1,
    workspaceId: hexId(),
    ownerId: hexId(),
    editorId: hexId(),
    viewerId: hexId(),
    syncPort: 8787,
    canvasPort: 5173,
    createdAt: new Date().toISOString(),
  };
}

export async function readEnv() {
  try {
    const parsed = JSON.parse(await readFile(ENV_FILE, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeEnv(env) {
  await mkdir(dirname(ENV_FILE), { recursive: true });
  await writeFile(ENV_FILE, `${JSON.stringify(env, null, 2)}\n`);
  return env;
}

export async function ensureEnv(patch = {}) {
  const existing = (await readEnv()) ?? newEnv();
  return writeEnv({ ...existing, ...patch });
}

export function syncUrl(env) {
  return `ws://127.0.0.1:${env.syncPort}/sync`;
}

export function healthUrl(env) {
  return `http://127.0.0.1:${env.syncPort}/health`;
}

/** The member env a staged app inherits from Start. */
export function syncEnv(env, memberId) {
  return {
    SUITE_SYNC_URL: syncUrl(env),
    SUITE_SYNC_MEMBER: memberId,
    SUITE_SYNC_WORKSPACE: env.workspaceId,
    SUITE_SYNC_EPOCH: String(env.epoch ?? 1),
    SUITE_SYNC_DEVICE: memberId,
  };
}
