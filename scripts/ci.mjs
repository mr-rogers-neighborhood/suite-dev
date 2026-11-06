#!/usr/bin/env node
/**
 * The whole suite's gate, run here.
 *
 * This replaced a set of GitHub Actions workflows that could not run: the account is
 * locked for billing, and the workflows were the only thing that ever ran a repository's
 * own `check`. So the gate moved to the machine that builds the releases, which is also
 * the machine that holds the signing key — one place, one answer.
 *
 * Order matters. `suite-sync` publishes the packages Start and Canvas pin, so it goes
 * first; an app gate against a broken protocol is a confusing failure several steps away
 * from its cause. The cross-app e2e is last and opt-in, because it stages four real
 * binaries and needs a display.
 *
 * Usage: node scripts/ci.mjs [--e2e] [--only <repo>] [--dry]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { sibling } from "./lib/paths.mjs";

/** Each repository's gate, in the order this runner should try it. */
const PIPELINE = [
  { repo: "suite-sync", steps: [["Lint, build, typecheck, tests", ["check"]]] },
  { repo: "suite-start", steps: [["Lint, build, typecheck, tests", ["check"]]] },
  {
    repo: "suite-canvas",
    steps: [
      ["Lint", ["lint"]],
      ["Typecheck", ["typecheck"]],
      ["Unit tests", ["test"]],
      ["Story tests", ["test:stories"]],
      ["Build", ["build"]],
      ["Documentation", ["docs:check"]],
      ["Doc symbols", ["docs:symbols"]],
      ["Shape", ["shape"]],
      ["No secrets", ["security:secrets"]],
    ],
  },
  {
    repo: "suite-planner",
    steps: [
      ["Lint", ["lint"]],
      ["Typecheck", ["typecheck"]],
      ["Unit tests", ["test"]],
      ["Shape", ["shape"]],
      ["No unused files", ["knip"]],
      ["Build", ["build"]],
    ],
  },
  {
    repo: "suite-budget",
    steps: [
      ["Lint", ["lint"]],
      ["Typecheck", ["typecheck"]],
      ["Unit tests", ["test"]],
      ["Shape", ["shape"]],
      ["No unused files", ["knip"]],
      ["Build", ["build"]],
    ],
  },
  { repo: "suite-dev", steps: [["Format, lint, tests", ["check"]]] },
];

const argv = process.argv.slice(2);
const withE2e = argv.includes("--e2e");
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
  const dir = sibling(entry.repo);
  if (!existsSync(dir)) {
    results.push({ repo: entry.repo, step: "checkout", ok: false, detail: "not found" });
    break;
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
      report(results, entry.repo, label);
      process.exit(1);
    }
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
  const e2e = await run("xvfb-run", ["-a", "pnpm", "e2e"], sibling("suite-dev"));
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

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: { ...process.env, CI: "1" } });
    child.on("error", () => resolve(127));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function report(rows, failedRepo, failedStep) {
  process.stdout.write("\n");
  for (const row of rows) {
    process.stdout.write(`${row.ok ? "  ok  " : " FAIL "} ${row.repo.padEnd(14)} ${row.step}\n`);
  }
  if (failedRepo !== null) {
    process.stdout.write(`\nstopped at ${failedRepo} · ${failedStep}\n`);
  } else {
    const count = rows.length;
    process.stdout.write(`\n${count} step${count === 1 ? "" : "s"} passed\n`);
  }
}
