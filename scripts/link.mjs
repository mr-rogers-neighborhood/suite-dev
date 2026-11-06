#!/usr/bin/env node
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LINK_DIR, sibling } from "./lib/paths.mjs";
import { runOnce } from "./lib/proc.mjs";

/**
 * The consumers of the shared packages, and where each package's source lives.
 *
 * A released app installs these from a git tag. While a package is being edited,
 * `pnpm link` points the consumer at the source instead; `unlink` puts the
 * original files back. Nothing here is committed.
 */
const TARGETS = [
  {
    repo: "suite-canvas",
    dirs: [
      "../suite-start/packages/contracts",
      "../suite-start/packages/desktop",
      "../suite-start/packages/files",
      "../suite-sync/packages/protocol",
    ],
  },
  {
    repo: "suite-planner",
    dirs: ["../suite-start/packages/contracts", "../suite-start/packages/desktop"],
  },
  {
    repo: "suite-budget",
    dirs: ["../suite-start/packages/contracts", "../suite-start/packages/desktop"],
  },
];

const FILES = ["package.json", "pnpm-workspace.yaml"];

const command = process.argv[2] ?? "check";
const linkDirFor = (repo) => join(LINK_DIR, repo);

/**
 * Re-quote the overrides `pnpm link` appended.
 *
 * It writes `'@suite/contracts': link:…`; the consumer repos format YAML with
 * double quotes, so a linked tree would fail its own `check` for a reason that
 * has nothing to do with the code being worked on.
 */
async function normaliseWorkspaceQuotes(repoDir) {
  const path = join(repoDir, "pnpm-workspace.yaml");
  const text = await readOrNull(path);
  if (text === null) return;
  const quoted = text.replace(/^(\s*)'([^']+)':\s*(.*)$/gmu, '$1"$2": $3');
  if (quoted !== text) await writeFile(path, quoted);
}

async function readOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function link() {
  for (const target of TARGETS) {
    const repoDir = sibling(target.repo);
    const backup = linkDirFor(target.repo);
    await mkdir(backup, { recursive: true });

    for (const file of FILES) {
      const source = join(repoDir, file);
      if (!existsSync(source)) continue;
      const original = join(backup, `original-${file}`);
      if (!existsSync(original)) await cp(source, original);
    }

    console.log(`\n=== linking ${target.repo} ===`);
    await runOnce({
      name: `pnpm link ${target.repo}`,
      command: "pnpm",
      args: ["link", ...target.dirs],
      cwd: repoDir,
    });
    await runOnce({
      name: `pnpm install ${target.repo}`,
      command: "pnpm",
      args: ["install"],
      cwd: repoDir,
    });

    // `pnpm link` writes its overrides single-quoted, which the repos' formatter
    // rejects: a linked tree would fail `check` before any code was written.
    await normaliseWorkspaceQuotes(repoDir);

    for (const file of FILES) {
      const source = join(repoDir, file);
      if (!existsSync(source)) continue;
      await cp(source, join(backup, `linked-${file}`));
    }
  }

  console.log(`
Linked. The consumers now point at the sibling source.
Revert with \`pnpm unlink:local\`; never commit a link: specifier.`);
}

async function unlink() {
  let blocked = 0;

  for (const target of TARGETS) {
    const repoDir = sibling(target.repo);
    const backup = linkDirFor(target.repo);
    console.log(`\n=== unlinking ${target.repo} ===`);

    for (const file of FILES) {
      const current = await readOrNull(join(repoDir, file));
      const linked = await readOrNull(join(backup, `linked-${file}`));
      const original = await readOrNull(join(backup, `original-${file}`));
      if (current === null || original === null) continue;

      if (linked !== null && current !== linked) {
        console.error(
          `${target.repo}/${file} changed since the link; leaving it alone. ` +
            `Review \`git -C ${repoDir} diff -- ${file}\` and restore it by hand.`,
        );
        blocked += 1;
        continue;
      }
      await writeFile(join(repoDir, file), original);
      console.log(`restored ${target.repo}/${file}`);
    }

    if (blocked === 0) {
      await runOnce({
        name: `pnpm install ${target.repo}`,
        command: "pnpm",
        args: ["install"],
        cwd: repoDir,
      });
    }
  }

  if (blocked > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(`
Unlinked. Check \`git status\` in each repository before committing.`);
}

async function check() {
  for (const target of TARGETS) {
    const repoDir = sibling(target.repo);
    const manifest = await readOrNull(join(repoDir, "package.json"));
    const workspace = await readOrNull(join(repoDir, "pnpm-workspace.yaml"));
    const linked = [];
    if (manifest !== null) {
      const parsed = JSON.parse(manifest);
      for (const [name, spec] of Object.entries(parsed.dependencies ?? {})) {
        if (typeof spec === "string" && spec.startsWith("link:")) linked.push(`${name} -> ${spec}`);
      }
    }
    if (workspace !== null) {
      for (const line of workspace.split("\n")) {
        const match = /^\s+['"]?([@a-z0-9/_-]+)['"]?:\s*link:(.+)$/iu.exec(line);
        if (match !== null) linked.push(`${match[1]} -> link:${match[2].trim()}`);
      }
    }
    const unique = [...new Set(linked)];
    console.log(`${target.repo}: ${unique.length === 0 ? "on released specs" : unique.join(", ")}`);
  }
}

try {
  if (command === "link") await link();
  else if (command === "unlink") await unlink();
  else if (command === "check") await check();
  else throw new Error(`unknown command ${command}; use link, unlink or check`);
} catch (error) {
  console.error(`\nlink failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
