#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readEnv } from "./lib/env.mjs";
import { executableOf, manifestOf, stagedAppIds } from "./lib/installs.mjs";
import { DEV, ENV_FILE, sibling, WORKSPACE_DIR } from "./lib/paths.mjs";
import { isPortFree } from "./lib/ports.mjs";
import { APPS, SIBLING_REPOS } from "./lib/repos.mjs";

const rows = [];
let failures = 0;

function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  rows.push({ label, ok, detail });
}

check("node >= 22", Number(process.versions.node.split(".")[0]) >= 22, process.versions.node);
check("pnpm", true, process.env.npm_config_user_agent ?? "installed");

const display = process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY ?? null;
const headless = process.platform === "linux" && display === null;
check(
  "display",
  !headless || existsSync("/usr/bin/xvfb-run"),
  headless ? "no DISPLAY; xvfb-run present" : (display ?? "native"),
);

for (const name of SIBLING_REPOS) {
  check(`repo ${name}`, existsSync(join(sibling(name), "package.json")), sibling(name));
}

const staged = await stagedAppIds();
for (const app of APPS) {
  const executable = executableOf(app);
  const present = existsSync(executable);
  check(`staged ${app.id}`, present, present ? executable : "missing; run `pnpm apps:stage`");
  if (present && app.manifest) {
    check(`manifest ${app.id}`, existsSync(manifestOf(app)), manifestOf(app));
  }
}

check(
  "sync CLI built",
  existsSync(join(sibling("suite-sync"), "apps/server/dist/cli.js")),
  "apps/server/dist/cli.js",
);
check("seeded workspace", existsSync(join(WORKSPACE_DIR, "membership.json")), WORKSPACE_DIR);

const env = await readEnv();
check("env file", env !== null, ENV_FILE);
if (env !== null) {
  check(`port ${env.syncPort} free`, await isPortFree(env.syncPort), "sync");
  check(`port ${env.canvasPort} free`, await isPortFree(env.canvasPort), "canvas");
}

check(".dev", existsSync(DEV), DEV);

const width = Math.max(...rows.map((row) => row.label.length));
console.log("");
for (const row of rows) {
  console.log(`${row.ok ? "ok  " : "FAIL"}  ${row.label.padEnd(width)}  ${row.detail}`);
}
console.log(
  `\n${rows.length - failures}/${rows.length} checks passed; ${staged.length} app(s) staged.\n`,
);

if (failures > 0) process.exitCode = 1;
