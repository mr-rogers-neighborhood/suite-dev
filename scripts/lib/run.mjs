import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureEnv, healthUrl, syncEnv, syncUrl } from "./env.mjs";
import { executableOf } from "./installs.mjs";
import {
  DATA_DIR,
  LOGS_DIR,
  profileDocuments,
  profileStartData,
  sibling,
  WORKSPACE_DIR,
} from "./paths.mjs";
import { findFreePort, waitForHttp } from "./ports.mjs";
import { failFast, installSignalHandlers, startService, stopAll, tailFile } from "./proc.mjs";
import { APPS, appById, appProfileEnv, missingSiblings, repoDir } from "./repos.mjs";

export function requireSiblings() {
  const missing = missingSiblings();
  if (missing.length > 0) {
    throw new Error(
      `missing sibling repositories: ${missing.join(", ")}. Clone them beside ${process.cwd()}.`,
    );
  }
}

export function requireStaged() {
  const start = appById("start");
  const executable = executableOf(start);
  if (!existsSync(executable)) {
    throw new Error(`Start is not staged (${executable}). Run \`pnpm apps:stage\` first.`);
  }
  return executable;
}

/** Every app's documents and data environment for one profile. */
export function profileEnv(profile) {
  const documentsRoot = profileDocuments(profile);
  const userDataRoot = join(DATA_DIR, profile);
  const startDataRoot = profileStartData(profile);
  const env = {};
  for (const app of APPS) {
    Object.assign(env, appProfileEnv(app, { documentsRoot, userDataRoot, startDataRoot }));
  }
  return env;
}

export function syncFor(env, memberId) {
  return syncEnv(env, memberId);
}

export async function prepareEnv() {
  const env = await ensureEnv();
  env.syncPort = await findFreePort(env.syncPort);
  env.canvasPort = await findFreePort(env.canvasPort);
  return ensureEnv(env);
}

export async function startSyncServer(env) {
  const cli = join(sibling("suite-sync"), "apps/server/dist/cli.js");
  if (!existsSync(cli)) {
    throw new Error(
      `${cli} is missing. Run \`pnpm --filter @suite/sync-server build\` in suite-sync first.`,
    );
  }

  const handle = startService({
    name: "sync",
    command: process.execPath,
    args: [
      cli,
      "serve",
      "--host",
      "127.0.0.1",
      "--port",
      String(env.syncPort),
      "--workspace",
      WORKSPACE_DIR,
    ],
    cwd: sibling("suite-sync"),
    logFile: join(LOGS_DIR, "sync.log"),
  });

  const ready = await Promise.race([
    waitForHttp(healthUrl(env), 15_000).then((ok) => ({ ok })),
    failFast(handle, "suite-sync").then(() => ({ ok: false })),
  ]);
  if (!ready.ok) {
    const tail = await tailFile(join(LOGS_DIR, "sync.log"), 20);
    throw new Error(`suite-sync did not answer ${healthUrl(env)}${tail ? `\n${tail}` : ""}`);
  }
  console.log(`sync server ready at ${syncUrl(env)}`);
  return handle;
}

/** Keep the process alive until one child exits, then stop the rest. */
export function untilAnyExit(handles) {
  installSignalHandlers();
  return new Promise((resolve) => {
    for (const handle of handles) {
      handle.child.once("exit", (code, signal) => resolve({ name: handle.name, code, signal }));
    }
  }).then((result) => {
    stopAll();
    return result;
  });
}

export function startStagedStart({ env, profile, memberId, files = [] }) {
  const start = appById("start");
  const executable = executableOf(start);
  const args = [...(process.env.SUITE_DEV_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), ...files];
  return startService({
    name: `start-${profile}`,
    command: executable,
    args,
    cwd: repoDir(start),
    env: { ...profileEnv(profile), ...syncFor(env, memberId) },
    logFile: join(LOGS_DIR, `start-${profile}.log`),
  });
}
