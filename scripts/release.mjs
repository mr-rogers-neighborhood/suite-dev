#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { ROOT } from "./lib/paths.mjs";
import { runOnce } from "./lib/proc.mjs";
import { appById, projectDir, releaseDir, repoDir } from "./lib/repos.mjs";

const run = promisify(execFile);

/**
 * Release one app, with one command.
 *
 * A release used to be five remembered shell commands: check, build, package, sign,
 * upload. Each one is easy to get subtly wrong, and the wrong one is invisible until
 * an install refuses an update. This runs them in the only order that works, and
 * refuses to start when the answers would contradict each other.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not bump anything.** The version in `package.json` is the release; this
 *   builds what is there.
 * - **It does not read `git describe`.** Canvas's history carries `v1.0.0`–`v1.1.0` tags
 *   from an older layout above the current `v0.1.0`, so tags cannot be trusted to name
 *   a version. `package.json` can.
 *
 * The signing key never leaves this machine, and the pipeline never runs this: the
 * gate answers "is this repository healthy", not "is this release good". See ADR-0002
 * and `docs/how-to/release.md`.
 */

/** The version a `package.json` names, or null when it names none. */
export function versionFromPackage(text) {
  try {
    const value = JSON.parse(text).version;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Why a release must not be cut, or null when the versions agree.
 *
 * `manifestVersion` is undefined for the hub, which ships no manifest.
 */
export function versionDisagreement({ packageVersion, manifestVersion }) {
  if (packageVersion === null) return "package.json names no version";
  if (manifestVersion === undefined) return null;
  if (manifestVersion === null) return "suite.app.json names no version";
  if (manifestVersion === packageVersion) return null;
  return (
    `package.json says ${packageVersion} and suite.app.json says ${manifestVersion}. ` +
    "The version, the manifest and the tag describe one commit, so they have to agree."
  );
}

/**
 * The artifact `electron-builder` named in the feed it just wrote.
 *
 * The top-level `path:` is the primary file; `files:` may also list a `.blockmap`
 * that rides along. This reads the name only — the fingerprint and size in the same
 * file are what an installer checks, and this script copies the file it names.
 */
export function artifactNameFromFeed(text) {
  for (const line of text.split(/\r?\n/u)) {
    const match = /^path:\s*(.+?)\s*$/u.exec(line);
    if (match?.[1] !== undefined) {
      const value = match[1].replace(/^["']|["']$/gu, "");
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/** Usage, printed for `--help` and for anything this cannot make sense of. */
const USAGE = `usage: node scripts/release.mjs <app-id> [options]

  --feed-dir <path>   write the artifact, the feed and its signature into a folder
  --publish           create the GitHub release for v<version>
  --notes-file <path> notes for that release (default: GitHub's generated notes)
  --dry-run           do everything except upload
`;

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} needs a value`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    appId: null,
    feedDir: null,
    notesFile: null,
    publish: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--publish") options.publish = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--feed-dir") {
      options.feedDir = takeValue(argv, index, "--feed-dir");
      index += 1;
    } else if (arg === "--notes-file") {
      options.notesFile = takeValue(argv, index, "--notes-file");
      index += 1;
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (options.appId === null) options.appId = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }

  return options;
}

/** A tree with uncommitted work is not a release: the artifact would carry what nobody reviewed. */
async function refuseDirty(repo) {
  const { stdout } = await run("git", ["status", "--porcelain"], { cwd: repo });
  if (stdout.trim().length === 0) return;
  const changed = stdout.trim().split(/\r?\n/u).slice(0, 10).join("\n");
  throw new Error(
    `the ${repo} tree has uncommitted changes, so this is not a release:\n${changed}\n` +
      "Commit or stash them first.",
  );
}

/** The version the release will be, and the files that have to agree about it. */
async function releaseVersion(app) {
  const project = projectDir(app);
  const packageText = await readFile(join(project, "package.json"), "utf8");
  const packageVersion = versionFromPackage(packageText);

  let manifestVersion;
  const manifestPath = join(project, "suite.app.json");
  if (existsSync(manifestPath)) {
    manifestVersion = versionFromPackage(await readFile(manifestPath, "utf8"));
  }

  const problem = versionDisagreement({ packageVersion, manifestVersion });
  if (problem !== null) throw new Error(problem);
  return packageVersion;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exit(2);
  }

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (options.appId === null) {
    process.stderr.write(`no app named\n\n${USAGE}`);
    process.exit(2);
  }
  if (options.publish && options.dryRun) {
    process.stderr.write("--publish and --dry-run contradict each other\n");
    process.exit(2);
  }

  const app = appById(options.appId);
  if (app === null) {
    process.stderr.write(`unknown app ${options.appId}\n\n${USAGE}`);
    process.exit(2);
  }

  const repo = repoDir(app);
  await refuseDirty(repo);

  const version = await releaseVersion(app);
  console.log(`\nreleasing ${app.name} ${version}`);

  // The gate is the same command the pipeline runs, so "the gate passed" is something
  // this saw rather than something a person remembered.
  console.log("\n=== gate ===");
  await runOnce({ name: "check:full", command: "pnpm", args: ["run", "check:full"], cwd: repo });

  console.log("\n=== build ===");
  await runOnce({
    name: "build",
    command: "pnpm",
    args: ["--filter", app.package, "run", "build"],
    cwd: repo,
  });

  console.log("\n=== package ===");
  await runOnce({
    name: "electron-builder",
    command: "pnpm",
    args: [
      "--filter",
      app.package,
      "exec",
      "electron-builder",
      "--linux",
      "AppImage",
      "--publish",
      "never",
    ],
    cwd: repo,
  });

  const release = releaseDir(app);
  const feedPath = join(release, "latest-linux.yml");
  if (!existsSync(feedPath)) throw new Error(`${feedPath} is missing after packaging`);

  const artifactName = artifactNameFromFeed(await readFile(feedPath, "utf8"));
  if (artifactName === null) throw new Error(`${feedPath} names no artifact`);
  const artifactPath = join(release, artifactName);
  if (!existsSync(artifactPath)) throw new Error(`${artifactPath} is missing after packaging`);

  console.log("\n=== sign ===");
  await runOnce({
    name: "sign-release",
    command: process.execPath,
    args: [join(ROOT, "scripts", "sign-release.mjs"), feedPath],
    cwd: ROOT,
  });
  const signaturePath = `${feedPath}.sig`;
  if (!existsSync(signaturePath)) throw new Error(`${signaturePath} was not written`);

  if (options.feedDir !== null) {
    await mkdir(options.feedDir, { recursive: true });
    for (const file of [artifactPath, feedPath, signaturePath]) {
      await copyFile(file, join(options.feedDir, basename(file)));
    }
    console.log(`\nfeed written to ${options.feedDir}`);
    console.log(`  ${artifactName}`);
    console.log("  latest-linux.yml");
    console.log("  latest-linux.yml.sig");
  }

  const tag = `v${version}`;
  if (!options.publish) {
    const why = options.dryRun ? " (dry run)" : "";
    console.log(`\nnot published${why}. To publish: node scripts/release.mjs ${app.id} --publish`);
    console.log(`  tag   ${tag}`);
    console.log(`  files ${artifactPath}`);
    console.log(`        ${feedPath}`);
    console.log(`        ${signaturePath}`);
    return;
  }

  console.log(`\n=== publish ${tag} ===`);
  const notes =
    options.notesFile === null ? ["--generate-notes"] : ["--notes-file", options.notesFile];
  await runOnce({
    name: "gh release create",
    command: "gh",
    args: [
      "release",
      "create",
      tag,
      artifactPath,
      feedPath,
      signaturePath,
      "--title",
      `${app.name} ${version}`,
      ...notes,
    ],
    cwd: repo,
  });
  console.log(`\npublished ${tag}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`\n${error.message}\n`);
    process.exit(1);
  }
}
