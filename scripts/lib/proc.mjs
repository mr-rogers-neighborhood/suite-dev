import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { PID_DIR } from "./paths.mjs";

/** Every service this process started, so one Ctrl-C stops the tree. */
const services = [];
let handlersInstalled = false;

const COLOURS = ["36", "35", "32", "33", "34", "31"];

function colourFor(name) {
  const key = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return COLOURS[key % COLOURS.length];
}

/** Run a command to completion with inherited stdio; reject on a non-zero exit. */
export function runOnce({ name, command, args = [], cwd, env = {} }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with ${code ?? signal}`));
    });
  });
}

function prefixStream(stream, name, logStream) {
  const prefix = `\u001B[${colourFor(name)}m[${name}]\u001B[0m`;
  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    process.stdout.write(`${prefix} ${line}\n`);
    logStream?.write(`${line}\n`);
  });
}

/**
 * Start a long-running service with prefixed logs and a log file.
 *
 * `detached` puts the child in its own process group on POSIX so a signal can
 * reach the grandchildren too: `pnpm` sits between this process and Vite or
 * Electron, and signalling only the top leaves a server holding a port.
 */
export function startService({ name, command, args = [], cwd, env = {}, logFile }) {
  let logStream = null;
  if (logFile !== undefined) {
    mkdirSync(dirname(logFile), { recursive: true });
    logStream = createWriteStream(logFile, { flags: "a" });
  }

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
  });

  prefixStream(child.stdout, name, logStream);
  prefixStream(child.stderr, name, logStream);
  child.once("exit", () => {
    logStream?.end();
    try {
      unlinkSync(pidFileFor(name));
    } catch {
      // Already removed by stopService.
    }
  });

  const handle = { name, child, stop: () => stopService(handle) };
  services.push(handle);
  recordPid(name, child.pid);

  return handle;
}

function pidFileFor(name) {
  return join(PID_DIR, `${name.replace(/[^a-zA-Z0-9-]/gu, "_")}.pid`);
}

function recordPid(name, pid) {
  if (pid === undefined) return;
  mkdirSync(PID_DIR, { recursive: true });
  writeFileSync(pidFileFor(name), String(pid));
}

/**
 * Kill services a previous run left behind.
 *
 * A hard kill of the orchestrator cannot run its signal handler, and a detached
 * service survives it. The pid files are what make the next run recover instead
 * of fighting a stale server for a port.
 */
export function stopStale() {
  if (!existsSync(PID_DIR)) return [];
  const stopped = [];
  for (const entry of readdirSync(PID_DIR)) {
    if (!entry.endsWith(".pid")) continue;
    const path = join(PID_DIR, entry);
    const pid = Number(readFileSync(path, "utf8").trim());
    if (!Number.isInteger(pid) || pid <= 0) {
      unlinkSync(path);
      continue;
    }
    try {
      process.kill(-pid, "SIGTERM");
      stopped.push(pid);
    } catch {
      // Not running, or not a group leader; either way the file is stale.
    }
    try {
      unlinkSync(path);
    } catch {
      // Raced with another cleanup.
    }
  }
  return stopped;
}

export function stopService(handle) {
  try {
    unlinkSync(pidFileFor(handle.name));
  } catch {
    // Already gone.
  }
  const { child } = handle;
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    // Negative pid signals the whole group.
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

export function stopAll() {
  for (const handle of [...services].reverse()) stopService(handle);
  services.length = 0;
}

/** Install one SIGINT/SIGTERM handler for the whole run. */
export function installSignalHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  const stop = () => {
    stopAll();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", stopAll);
}

/**
 * Watch a service and fail the run when it dies early.
 *
 * A server that exits immediately otherwise looks like a slow start, and the
 * next command reports a timeout that says nothing about the cause.
 */
export function failFast(handle, label) {
  return new Promise((_, reject) => {
    handle.child.once("exit", (code, signal) => {
      if (code === 0 || code === null) return;
      reject(new Error(`${label} exited with ${code ?? signal}`));
    });
  });
}

export async function tailFile(path, lines = 20) {
  try {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(path, "utf8");
    return text.split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}
