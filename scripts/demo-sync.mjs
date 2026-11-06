#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { healthUrl, syncUrl } from "./lib/env.mjs";
import { profileDocuments } from "./lib/paths.mjs";
import { installSignalHandlers, stopAll, stopStale } from "./lib/proc.mjs";
import {
  prepareEnv,
  requireSiblings,
  requireStaged,
  startStagedStart,
  startSyncServer,
  untilAnyExit,
} from "./lib/run.mjs";

/**
 * Two real hubs, two real Canvas copies, one workspace.
 *
 * Each profile gets its own documents root, so each Canvas gets its own file and
 * its own writer lock; the sync server is the only shared thing. That is the
 * shape a person actually uses, and it is the shape the demo should test.
 */
requireSiblings();
requireStaged();
stopStale();

const env = await prepareEnv();
installSignalHandlers();

const demoFile = (profile) => join(profileDocuments(profile), "Canvas", "Demo.canvas");
for (const profile of ["owner", "editor"]) {
  if (!existsSync(demoFile(profile))) {
    throw new Error(`${demoFile(profile)} is missing. Run \`pnpm seed\` first.`);
  }
}

const services = [await startSyncServer(env)];

const owner = startStagedStart({
  env,
  profile: "owner",
  memberId: env.ownerId,
  files: [demoFile("owner")],
});
const editor = startStagedStart({
  env,
  profile: "editor",
  memberId: env.editorId,
  files: [demoFile("editor")],
});
services.push(owner, editor);

console.log(`
Two members, one workspace:

  workspace ${env.workspaceId}
  owner     ${env.ownerId}
  editor    ${env.editorId}

  sync      ${healthUrl(env)}
  socket    ${syncUrl(env)}

Edit a card in one window; the other receives it. \`curl ${healthUrl(env)}\`
should report two clients. Ctrl-C stops everything.`);

const result = await untilAnyExit(services);
if (result.code !== 0) {
  console.error(`\n${result.name} exited with ${result.code ?? result.signal}`);
  process.exitCode = 1;
} else {
  stopAll();
}
