#!/usr/bin/env node
/**
 * The whole suite's gate, run here.
 *
 * This replaced a set of GitHub Actions workflows that could not run: the account's
 * education entitlement lapsed, so every job failed at startup before a step began. A
 * workflow that cannot start looks like a gate and is a comment, so the gate moved to the
 * machine that builds the releases, which is also the machine that holds the signing key.
 *
 * Do not add a CI service back. ADR-0002 is the record, and the rule it states is that a
 * red mark nothing can act on is worse than no mark.
 *
 * Order matters. `suite-sync` publishes the packages Start and Canvas pin, so it goes
 * first; an app gate against a broken protocol is a confusing failure several steps away
 * from its cause. The cross-app e2e is last and opt-in, because it stages four real
 * binaries and needs a display.
 *
 * `--fresh` answers a different question from the default run. The default proves that this
 * working tree passes. `--fresh` proves that this *commit* passes, by exporting HEAD into a
 * directory with no node_modules, no build output and no untracked files, installing from the
 * lockfile there, and running the gate against that. A warm cache can make a broken commit green;
 * this is the only thing here that cannot.
 *
 * Usage: node scripts/ci.mjs [--e2e] [--fresh] [--only <repo>] [--dry]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEV, sibling } from "./lib/paths.mjs";

/**
 * Each repository's gate, in the order this runner should try it.
 *
 * One command per repository, and it is the repository's own `check:full`, so there is
 * exactly one definition of "this repository is healthy" rather than a list here that
 * drifts from a list there.
 */
const PIPELINE = [
  { repo: "suite-sync", steps: [["The gate", ["check:full"]]] },
  { repo: "suite-start", steps: [["The gate", ["check:full"]]] },
  { repo: "suite-canvas", steps: [["The gate", ["check:full"]]] },
  { repo: "suite-planner", steps: [["The gate", ["check:full"]]] },
  { repo: "suite-budget", steps: [["The gate", ["check:full"]]] },
  // The mobile container pins the same shared packages, so a break there reaches the
  // desktop through @suite/theme and @suite/ui. Its gate was never in this list, which
  // made the only cross-platform repository the only ungated one.
  { repo: "suite-go", steps: [["The gate", ["check:full"]]] },
  { repo: "suite-dev", steps: [["The gate", ["check:full"]]] },
];

/** Every repository whose gate this runner knows about, used to reconstruct sibling paths. */
const ALL_REPOS = [
  "suite-start",
  "suite-canvas",
  "suite-planner",
  "suite-budget",
  "suite-sync",
  "suite-dev",
  "suite-go",
];

const argv = process.argv.slice(2);
const withE2e = argv.includes("--e2e");
const fresh = argv.includes("--fresh");
const dry = argv.includes("--dry");
const onlyFlag = argv.indexOf("--only");
const only = onlyFlag < 0 ? null : argv[onlyFlag + 1];

const selected = only === null ? PIPELINE : PIPELINE.filter((entry) => entry.repo === only);
if (selected.length === 0) {
  process.stderr.write(`no repository named ${only}\n`);
  process.exit(2);
}

const results = [];

for (const entry of selected) {
  const source = sibling(entry.repo);
  if (!existsSync(source)) {
    results.push({ repo: entry.repo, step: "checkout", ok: false, detail: "not found" });
    break;
  }

  let dir = source;

  if (fresh) {
    if (dry) {
      process.stdout.write(`\n▶ ${entry.repo} · export HEAD and install\n`);
      results.push({ repo: entry.repo, step: "fresh export", ok: true, detail: "dry run" });
      continue;
    }

    // A commit, not a working tree. Say so when the two differ, because otherwise a person
    // reads a pass as a statement about the code they are looking at.
    const dirty = await run("git", ["status", "--porcelain"], source, { quiet: true });
    if (dirty !== 0) {
      process.stdout.write(`\n! ${entry.repo} has uncommitted changes; testing HEAD, not them\n`);
    }

    const exported = await exportHead(entry.repo);
    if (!exported.ok) {
      results.push({ repo: entry.repo, step: "export", ok: false, detail: "git archive failed" });
      report(results, entry.repo, "export");
      process.exit(1);
    }
    dir = exported.dir;

    // The export lives inside this repository's `.dev`, so without a ceiling `git rev-parse`
    // walks up and finds suite-dev's `.git`. Every tool that asks "is this a checkout" would
    // then get yes and read the wrong history: doc indexes would lose their dates, and
    // `--changed` would compare against this repository's commits. The ceiling makes the
    // export answer honestly: it has no repository.
    // The ceiling is the export's *parent*: git checks a directory before honouring the list,
    // so naming the export itself still lets it look one level up into suite-dev.
    process.env.GIT_CEILING_DIRECTORIES = dirname(exported.dir);

    process.stdout.write(`\n▶ ${entry.repo} · install from the lockfile\n`);

    const installed = await run("pnpm", ["install", "--frozen-lockfile"], dir);
    if (installed !== 0) {
      results.push({ repo: entry.repo, step: "install", ok: false, detail: `exit ${installed}` });
      report(results, entry.repo, "install", dir);
      process.exit(1);
    }
  }

  for (const [label, args] of entry.steps) {
    process.stdout.write(`\n▶ ${entry.repo} · ${label}\n`);
    if (dry) {
      results.push({ repo: entry.repo, step: label, ok: true, detail: "dry run" });
      continue;
    }

    const code = await run("pnpm", args, dir);
    results.push({
      repo: entry.repo,
      step: label,
      ok: code === 0,
      detail: code === 0 ? "" : `exit ${code}`,
    });
    if (code !== 0) {
      report(results, entry.repo, label, fresh ? dir : null);
      process.exit(1);
    }
  }

  // A passing export is disposable; a failing one is evidence and is kept by the early exit.
  if (fresh) {
    await rm(dir, { recursive: true, force: true });
    delete process.env.GIT_CEILING_DIRECTORIES;
  }
}

if (withE2e && (only === null || only === "suite-dev")) {
  process.stdout.write("\n▶ suite-dev · the cross-app suite\n");
  const staged = await run("pnpm", ["apps:stage"], sibling("suite-dev"));
  if (staged !== 0) {
    results.push({ repo: "suite-dev", step: "stage", ok: false, detail: `exit ${staged}` });
    report(results, "suite-dev", "stage");
    process.exit(1);
  }
  // `pnpm e2e` puts itself on a virtual display when it can, so this does not wrap it
  // again: the script owns that decision and says which display it chose.
  const e2e = await run("pnpm", ["e2e"], sibling("suite-dev"));
  results.push({
    repo: "suite-dev",
    step: "e2e",
    ok: e2e === 0,
    detail: e2e === 0 ? "" : `exit ${e2e}`,
  });
  if (e2e !== 0) {
    report(results, "suite-dev", "e2e");
    process.exit(1);
  }
}

report(results, null, null);

function run(command, args, cwd, { quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: quiet ? "ignore" : "inherit",
      env: { ...process.env, CI: "1" },
    });
    child.on("error", () => resolve(127));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/**
 * HEAD of one repository, unpacked where its siblings still resolve.
 *
 * `git archive` writes tracked files only, so a warm `node_modules`, a stale `dist` and a
 * gitignored `.env` are all absent by construction. That is the whole point: those are the three
 * things that let a broken commit look green.
 *
 * The export lands beside symlinks to the other checkouts rather than in a temp directory,
 * because Canvas declares `@suite/desktop` and `@suite/sync` as `link:../suite-*` and those
 * resolve only from a sibling position. The claim that follows is stated in the doc: the
 * repository's own commit is clean, while a `link:` dependency still comes from the working tree.
 */
async function exportHead(repo) {
  const root = join(DEV, "ci-fresh");
  const dir = join(root, repo);
  await mkdir(dir, { recursive: true });

  for (const other of ALL_REPOS) {
    if (other === repo) continue;
    const source = sibling(other);
    if (!existsSync(source)) continue;
    const link = join(root, other);
    await rm(link, { recursive: true, force: true });
    await symlink(source, link, "dir");
  }

  const tar = join(root, `${repo}.tar`);
  const archived = await run("git", ["archive", "--format=tar", "-o", tar, "HEAD"], sibling(repo), {
    quiet: true,
  });
  if (archived !== 0) return { ok: false, dir };

  const unpacked = await run("tar", ["-xf", tar, "-C", dir], root, { quiet: true });
  await rm(tar, { force: true });
  return { ok: unpacked === 0, dir };
}

function report(rows, failedRepo, failedStep, keptDir = null) {
  process.stdout.write("\n");
  for (const row of rows) {
    process.stdout.write(`${row.ok ? "  ok  " : " FAIL "} ${row.repo.padEnd(14)} ${row.step}\n`);
  }
  if (failedRepo !== null) {
    process.stdout.write(`\nstopped at ${failedRepo} · ${failedStep}\n`);
    if (keptDir !== null) {
      // Evidence, not debris: this is the tree the failure came from, and it is the only copy
      // that exists once a passing run deletes its own export.
      process.stdout.write(`the export is kept at ${keptDir}\n`);
    }
  } else {
    const count = rows.length;
    process.stdout.write(`\n${count} step${count === 1 ? "" : "s"} passed\n`);
  }
}
