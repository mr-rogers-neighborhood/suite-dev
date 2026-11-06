#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { executableOf, manifestOf, stagedRecords, writeInstalls } from "./lib/installs.mjs";
import { APPS_DIR, appDir, ensureDevDirs } from "./lib/paths.mjs";
import { runOnce } from "./lib/proc.mjs";
import { APPS, appById, missingSiblings, releaseDir, repoDir } from "./lib/repos.mjs";

const argv = process.argv.slice(2);
const only = flagValue("--only")
  ?.split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const build = !argv.includes("--no-build");
const boot = argv.includes("--boot");
// Playwright attaches to the main process over the Node inspector, which the
// shipped `runAsNode: false` / inspect fuse disables. A staged copy keeps every
// other fuse and loosens only that one; `--strict-fuses` builds the shipped
// article for a manual check that no test harness is involved.
const strictFuses = argv.includes("--strict-fuses");

function flagValue(name) {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

/**
 * Stage the real binaries.
 *
 * `electron-builder --dir` is the documented "build an unpacked dir, useful to
 * test" mode. The output is the same shape Start launches after an install:
 * a binary with `suite.app.json` beside it.
 */
async function main() {
  const missing = missingSiblings();
  if (missing.length > 0) {
    throw new Error(
      `missing sibling repositories: ${missing.join(", ")}. ` +
        `Clone them beside ${process.cwd()} (see README.md).`,
    );
  }

  await ensureDevDirs();
  await mkdir(APPS_DIR, { recursive: true });

  const targets =
    only === undefined ? APPS : only.map((id) => appById(id)).filter((app) => app !== null);
  if (targets.length === 0) throw new Error("nothing to stage; check --only");

  for (const app of targets) {
    console.log(`\n=== ${app.name} (${app.id}) ===`);
    if (build) {
      await runOnce({
        name: `build ${app.id}`,
        command: "pnpm",
        args: ["--filter", app.package, "run", "build"],
        cwd: repoDir(app),
      });
      await runOnce({
        name: `package ${app.id}`,
        command: "pnpm",
        args: [
          "--filter",
          app.package,
          "exec",
          "electron-builder",
          "--dir",
          ...(strictFuses ? [] : ["-c.electronFuses.enableNodeCliInspectArguments=true"]),
        ],
        cwd: repoDir(app),
      });
    }

    const unpacked = await findUnpacked(releaseDir(app));
    const destination = appDir(app.id);
    await rm(destination, { recursive: true, force: true });
    await cp(unpacked, destination, { recursive: true, verbatimSymlinks: true });

    const executable = executableOf(app, destination);
    if (!existsSync(executable)) {
      throw new Error(`${app.id}: no executable at ${executable}`);
    }
    if (app.manifest && !existsSync(manifestOf(app, destination))) {
      throw new Error(
        `${app.id}: suite.app.json is missing from the staged build. ` +
          `Check extraFiles in ${app.project}/electron-builder.yml.`,
      );
    }
    console.log(`staged ${app.id} -> ${destination}`);

    if (boot) await bootCheck(app, executable);
  }

  const records = await stagedRecords();
  const path = await writeInstalls("default", records);
  console.log(`\n${records.length} app(s) staged; Start will read ${path}`);
}

async function findUnpacked(directory) {
  if (!existsSync(directory)) {
    throw new Error(`no release directory at ${directory}; did the build run?`);
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith("-unpacked") || name.endsWith(".app"));
  if (candidates.length === 0) {
    throw new Error(`no unpacked build under ${directory}`);
  }
  const preferred = candidates.find((name) => name.endsWith("-unpacked")) ?? candidates[0];
  return join(directory, preferred);
}

/**
 * Start the binary and see that it stays up.
 *
 * A packaged app that cannot find a dependency exits in under a second, and a
 * timeout that reports "no window" sends the reader looking in the wrong place.
 */
function bootCheck(app, executable) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--no-sandbox"], {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
    });
    let exited = null;
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("exit", (code, signal) => {
      exited = code ?? signal;
    });
    setTimeout(() => {
      if (exited !== null) {
        reject(new Error(`${app.id} exited during the boot check (${exited})`));
        return;
      }
      // Electron shows a dialog for a main-process exception and keeps the
      // process alive, so "still running" is not the same as "it booted".
      if (/A JavaScript error occurred|Uncaught Exception/iu.test(stderr)) {
        child.kill("SIGTERM");
        const first = stderr.split("\n").find((line) => line.trim().length > 0) ?? "";
        reject(new Error(`${app.id} reported a main-process error: ${first}`));
        return;
      }
      child.kill("SIGTERM");
      resolve();
    }, 3_000);
  });
}

main().catch((error) => {
  console.error(`\nstage failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
