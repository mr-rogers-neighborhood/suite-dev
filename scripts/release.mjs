#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

/**
 * A PKGBUILD with the version and checksum of the artifact just built.
 *
 * The committed PKGBUILD records the release it was written for; a release builds the
 * package from *its own* bytes, so both numbers are rewritten here rather than trusted
 * from the file. A stale checksum would fail makepkg's verification, which is the point:
 * the package must describe the artifact this run produced, not the one it replaced.
 */
export function pkgbuildFor({ text, version, sha256 }) {
  const patched = text
    .replace(/^pkgver=.*$/mu, `pkgver=${version}`)
    .replace(/^pkgrel=.*$/mu, "pkgrel=1")
    .replace(/^sha256sums=\(.*$/mu, `sha256sums=('${sha256}')`);
  const unchanged = ["pkgver", "sha256sums"].filter(
    (field) => !new RegExp(`^${field}=`, "mu").test(patched),
  );
  if (unchanged.length > 0) {
    throw new Error(`the PKGBUILD has no ${unchanged.join(" or ")} line to rewrite`);
  }
  return patched;
}

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
export function versionDisagreement({ packageVersion, manifestVersion, repoVersion }) {
  if (packageVersion === null) return "package.json names no version";
  if (manifestVersion === null) return "suite.app.json names no version";
  if (repoVersion !== undefined && repoVersion !== null && repoVersion !== packageVersion) {
    // The workspace root and the app manifest both carry a version, and only one of them is what
    // electron-builder stamps. A release cut with the root saying 0.3.12 and the app saying 0.3.11
    // produces a tag named 0.3.12 whose artifact is 0.3.11, and the feed then tells every 0.3.11
    // install that there is nothing to update. Silent, and worse than a refusal.
    return (
      `the repository root says ${repoVersion} and the app says ${packageVersion}. ` +
      "The artifact takes the app's version, so the tag would name a release that does not exist."
    );
  }
  if (manifestVersion === undefined) return null;
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
  --publish           create the GitHub release
  --tag <name>        the tag to release under (default: v<version>)
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
    tag: null,
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
    } else if (arg === "--tag") {
      options.tag = takeValue(argv, index, "--tag");
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

/**
 * What to say when a tag is already taken, or null when it is free.
 *
 * Pure so the sentence, and the reason for it, can be a test. `suite-start`'s existing
 * tags are the shared-package line (`v0.6.1`, `v0.7.0`) that the apps pin, and its app
 * version is `0.3.0` — so the default name is taken by something else entirely.
 */
export function tagProblem({ tag, version }) {
  if (tag === null || tag === undefined) return "no tag to release under";
  return (
    `the tag ${tag} already exists. A tag is a promise about one commit, so this will not ` +
    `land on it. Pass --tag with a name of its own (for suite-start: --tag start-v${version}).`
  );
}

/**
 * Whether a tag is already taken.
 *
 * A tag is a promise about one commit, and a release landing on a tag that already
 * points somewhere else would be a promise about the wrong one. In `suite-start` the
 * existing tags are the shared-package line (`v0.6.1`, `v0.7.0`) that the apps pin, so
 * the hub's own releases take `start-v0.3.0` and leave that line alone.
 */
async function tagExists(repo, tag) {
  try {
    await run("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: repo });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the commit being released is the one people can get.
 *
 * A release built from a local-only commit is a download that resolves to a tag nobody
 * can fetch, so the branch has to be level with its upstream before the upload.
 */
async function headIsPushed(repo) {
  try {
    const [head, upstream] = await Promise.all([
      run("git", ["rev-parse", "HEAD"], { cwd: repo }),
      run("git", ["rev-parse", "@{u}"], { cwd: repo }),
    ]);
    return head.stdout.trim() === upstream.stdout.trim();
  } catch {
    return false;
  }
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

  // The workspace root above the app directory carries its own version, which nothing stamps but
  // everyone reads. When it disagrees, the tag and the artifact disagree.
  let repoVersion;
  const repoPackage = join(project, "..", "..", "package.json");
  if (existsSync(repoPackage)) {
    repoVersion = versionFromPackage(await readFile(repoPackage, "utf8"));
  }

  const problem = versionDisagreement({ packageVersion, manifestVersion, repoVersion });
  if (problem !== null) throw new Error(problem);
  return packageVersion;
}

/**
 * What is wrong with a built package's file modes, or null when nothing is.
 *
 * 0.3.1 installed and then could not start: `cp -a` had reproduced the AppImage's 0700
 * directories onto `/opt/suite-start`, so the user could not traverse the tree and the
 * launcher reported its own binary as missing. Reading `bsdtar -tvf` is enough to catch
 * it before upload — the archive records the mode pacman will apply.
 *
 * `listing` is one `bsdtar -tvf` line per entry.
 */
export function packageModeProblems(listing) {
  const problems = [];
  let hasExecutable = false;

  for (const line of listing.split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    const match = TAR_LINE.exec(line.trim());
    if (match === null) continue;
    const [, kind, mode, path] = match;
    if (kind === undefined || mode === undefined || path === undefined) continue;

    if (kind === "d" && path.startsWith("opt/")) {
      // Readable and executable by everyone: a directory a person cannot traverse is a
      // directory whose contents do not exist as far as they are concerned.
      // Mode characters are owner/write/execute, then group, then other: the last
      // three are what everyone else gets.
      if (mode[6] !== "r" || mode[8] !== "x") {
        problems.push(`${path} is mode ${mode}, so a user cannot read or enter it`);
      }
    }

    if (path === "opt/suite-start/suite-start") {
      if (kind !== "-") problems.push("the hub's binary is not a regular file");
      else if (mode[2] !== "x" && mode[2] !== "s") {
        problems.push("the hub's binary is not executable");
      } else hasExecutable = true;
    }
  }

  if (!hasExecutable) problems.push("the package does not contain opt/suite-start/suite-start");
  return problems;
}

/**
 * One `bsdtar -tvf` line: kind, nine mode characters, then size, owner, group, day,
 * time and the path. Two spaces can pad the day, which `\s+` absorbs.
 */
const TAR_LINE =
  /^([-dlpscbD])([rwxsStT-]{9})\s+\d+\s+\S+\s+\S+\s+\d+\s+\S+\s+\d+\s+[\d:]+\s+(.+)$/u;

/** The SHA-256 makepkg verifies a source file against. */
async function sha256OfFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Build the Arch package for the artifact this run produced, when the app has one.
 *
 * A second delivery form for the same bytes: the PKGBUILD wraps the AppImage rather than
 * rebuilding the app, so the package and the signed feed cannot describe different
 * releases. Absent `packaging/arch/PKGBUILD` is not a failure — only the hub has one, and
 * makepkg is Arch-only, so a machine without it skips this with a note.
 */
async function packageFor(app, { version, artifactPath }) {
  const pkgbuildPath = join(projectDir(app), "packaging", "arch", "PKGBUILD");
  if (!existsSync(pkgbuildPath)) return null;
  if (process.platform !== "linux" || !existsSync("/usr/bin/makepkg")) {
    console.log("\nmakepkg is not here, so no Arch package was built");
    return null;
  }

  const text = await readFile(pkgbuildPath, "utf8");
  const pkgname = /^pkgname=(\S+)$/mu.exec(text)?.[1];
  if (pkgname === undefined) throw new Error(`${pkgbuildPath} names no pkgname`);

  const work = await mkdtemp(join(tmpdir(), "suite-pkg-"));
  const patched = pkgbuildFor({ text, version, sha256: await sha256OfFile(artifactPath) });
  await writeFile(join(work, "PKGBUILD"), patched);
  // Under the name its own `source=` alias declares, so makepkg verifies the file this
  // release just built instead of downloading a released copy of itself.
  await copyFile(artifactPath, join(work, `${pkgname}-${version}.AppImage`));

  console.log(`\n=== arch package (${pkgname}) ===`);
  await runOnce({
    name: "makepkg",
    command: "/usr/bin/makepkg",
    args: ["--nocheck", "--nodeps", "--force"],
    cwd: work,
  });

  const built = (await readdir(work)).find((name) => name.endsWith(".pkg.tar.zst"));
  if (built === undefined) throw new Error("makepkg produced no .pkg.tar.zst");

  // A package that cannot be started is worse than no package: it installs cleanly and
  // fails at launch. So the archive is read back before it is ever uploaded.
  const { stdout: listing } = await run("bsdtar", ["-tvf", built], { cwd: work });
  const problems = packageModeProblems(listing);
  if (problems.length > 0) {
    throw new Error(`${built} would not run:\n  ${problems.join("\n  ")}`);
  }
  const destination = join(releaseDir(app), built);
  await copyFile(join(work, built), destination);
  await rm(work, { recursive: true, force: true });
  return destination;
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
  const tag = options.tag ?? `v${version}`;
  // Both refusals are cheap and both are about the upload, so they run before a build
  // that takes minutes: a release that cannot be published should not be packaged.
  if (await tagExists(repo, tag)) throw new Error(tagProblem({ tag, version }));
  if (options.publish && !(await headIsPushed(repo))) {
    throw new Error(
      `${repo} is ahead of its upstream, so a release from here would name a commit nobody ` +
        "can fetch. Push the branch first, then publish.",
    );
  }

  console.log(`\nreleasing ${app.name} ${version} as ${tag}`);

  // The gate is the same command the pre-push hook runs, so "the gate passed" is something
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

  const packagePath = await packageFor(app, { version, artifactPath });

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

  if (!options.publish) {
    const why = options.dryRun ? " (dry run)" : "";
    console.log(`\nnot published${why}. To publish: node scripts/release.mjs ${app.id} --publish`);
    console.log(`  tag   ${tag}`);
    for (const file of [artifactPath, feedPath, signaturePath, packagePath]) {
      if (file !== null) console.log(`  file  ${file}`);
    }
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
      ...(packagePath === null ? [] : [packagePath]),
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
