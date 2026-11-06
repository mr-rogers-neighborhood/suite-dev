#!/usr/bin/env node
import { join } from "node:path";
import { healthUrl, syncUrl } from "./lib/env.mjs";
import { LOGS_DIR, sibling } from "./lib/paths.mjs";
import { installSignalHandlers, startService, stopAll, stopStale } from "./lib/proc.mjs";
import {
  prepareEnv,
  requireSiblings,
  requireStaged,
  startStagedStart,
  startSyncServer,
  syncFor,
  untilAnyExit,
} from "./lib/run.mjs";

const argv = process.argv.slice(2);
const mode = flagValue("--mode") ?? "dev";
const profile = flagValue("--profile") ?? "default";
const member = flagValue("--member") ?? (profile === "editor" ? "editorId" : "ownerId");
const withSync = !argv.includes("--no-sync");
const openFile = argv.includes("--open");

function flagValue(name) {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

requireSiblings();
const stale = stopStale();
if (stale.length > 0) console.log(`stopped ${stale.length} service(s) from an earlier run`);
const env = await prepareEnv();
installSignalHandlers();

const services = [];
if (withSync) services.push(await startSyncServer(env));
else console.log("sync server disabled (--no-sync)");

if (mode === "dev") {
  // `dev:desktop` already owns the Vite server and the shell; giving it the
  // port and the sync env is enough. It picks the port up through
  // SUITE_DEV_PORT, and the shell appends the sync params to the page URL.
  services.push(
    startService({
      name: "canvas",
      command: "pnpm",
      args: ["run", "dev:desktop"],
      cwd: sibling("suite-canvas"),
      env: {
        SUITE_DEV_PORT: String(env.canvasPort),
        ...(withSync ? syncFor(env, env[member] ?? env.ownerId) : {}),
      },
      logFile: join(LOGS_DIR, "canvas-dev.log"),
    }),
  );
  console.log(`Canvas dev loop on http://localhost:${env.canvasPort}`);
} else if (mode === "staged") {
  requireStaged();
  const files = openFile
    ? [join(sibling("suite-dev"), ".dev/documents", profile, "Canvas", "Demo.canvas")]
    : [];
  services.push(
    startStagedStart({
      env,
      profile,
      memberId: env[member] ?? env.ownerId,
      files,
    }),
  );
  console.log(`Start staged, profile "${profile}", member ${env[member] ?? env.ownerId}`);
} else {
  throw new Error(`unknown --mode ${mode}; use dev or staged`);
}

console.log(`
  sync   ${healthUrl(env)}
  socket ${syncUrl(env)}
  logs   ${LOGS_DIR}

Ctrl-C stops everything.`);

const result = await untilAnyExit(services);
if (result.code !== 0) {
  console.error(`\n${result.name} exited with ${result.code ?? result.signal}`);
  process.exitCode = 1;
} else {
  stopAll();
}
