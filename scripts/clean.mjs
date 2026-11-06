#!/usr/bin/env node
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { APPS_DIR, DEV, LOGS_DIR } from "./lib/paths.mjs";

const all = process.argv.includes("--all");
const targets = all ? [DEV] : [APPS_DIR, LOGS_DIR, join(DEV, "test-results")];

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
  console.log(`removed ${target}`);
}

if (!all)
  console.log("\nKept .dev/env.json, .dev/workspace and .dev/documents. Use --all to remove them.");
