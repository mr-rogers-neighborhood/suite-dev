#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canvasSchemaVersion, writeCanvasFile } from "./lib/canvasFile.mjs";
import { ensureEnv, readEnv, syncUrl } from "./lib/env.mjs";
import { stagedRecords, writeInstalls } from "./lib/installs.mjs";
import { ensureDevDirs, profileDocuments, sibling, WORKSPACE_DIR } from "./lib/paths.mjs";
import { findFreePort } from "./lib/ports.mjs";
import { runOnce } from "./lib/proc.mjs";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const PROFILES = ["default", "owner", "editor"];

const env = await ensureEnv();

// A port recorded by an earlier run may be taken now. Discovering one costs a
// hundred milliseconds and prevents the most common "it did not start" report.
env.syncPort = await findFreePort(env.syncPort);
env.canvasPort = await findFreePort(env.canvasPort);
await ensureEnv(env);

await ensureDevDirs();

const serverCli = join(sibling("suite-sync"), "apps/server/dist/cli.js");
if (!existsSync(serverCli)) {
  throw new Error(
    `${serverCli} is missing. Run \`pnpm --filter @suite/sync-server build\` in suite-sync first.`,
  );
}

const membership = join(WORKSPACE_DIR, "membership.json");
if (existsSync(membership) && !force) {
  console.log(
    `workspace already seeded (${membership}); keeping its ids. Use --force for new ones.`,
  );
} else {
  await runOnce({
    name: "suite-sync workspace init",
    command: process.execPath,
    args: [
      serverCli,
      "workspace",
      "init",
      WORKSPACE_DIR,
      "--workspace",
      env.workspaceId,
      "--owner",
      env.ownerId,
      "--editor",
      env.editorId,
      ...(force ? ["--force"] : []),
    ],
    cwd: sibling("suite-sync"),
  });
}

const snapshot = new Uint8Array(await readFile(join(WORKSPACE_DIR, "snapshot.loro")));
const schemaVersion = await canvasSchemaVersion();
const files = [];
for (const profile of PROFILES) {
  files.push(
    await writeCanvasFile({
      path: join(profileDocuments(profile), "Canvas", "Demo.canvas"),
      workspaceId: env.workspaceId,
      snapshot,
      schemaVersion,
    }),
  );
}

// A Start profile can only launch what has been staged. Writing the records here
// as well means `pnpm seed` after `pnpm apps:stage` is enough to run the demo.
const records = await stagedRecords();
const installs = [];
if (records.length > 0) {
  for (const profile of PROFILES) installs.push(await writeInstalls(profile, records));
}

const current = await readEnv();
console.log(`
Seeded ${WORKSPACE_DIR}

  workspace  ${current.workspaceId}
  owner      ${current.ownerId}
  editor     ${current.editorId}
  epoch      ${current.epoch}
  sync       ${syncUrl(current)}
  canvas     http://localhost:${current.canvasPort}

Files:
${files.map((file) => `  ${file}`).join("\n")}
${installs.length > 0 ? `\nInstall records:\n${installs.map((path) => `  ${path}`).join("\n")}` : "\nNo apps staged yet; run `pnpm apps:stage` to give Start something to launch."}

Web demo (two tabs):
  http://localhost:${current.canvasPort}/?workspace=${current.workspaceId}&fresh=1&syncUrl=${encodeURIComponent(
    syncUrl(current),
  )}&member=${current.ownerId}&epoch=${current.epoch}
  http://localhost:${current.canvasPort}/?workspace=${current.workspaceId}&fresh=1&syncUrl=${encodeURIComponent(
    syncUrl(current),
  )}&member=${current.editorId}&epoch=${current.epoch}
`);
