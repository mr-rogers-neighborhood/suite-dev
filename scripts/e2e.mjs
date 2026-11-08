#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Run the cross-app suite without taking over the desktop.
 *
 * These specs launch real Electron windows. Run on the developer's own display they pop up
 * wherever the window manager decides — which, mid-task, means the cursor and the focus
 * leave whatever the person was doing. Three or four windows doing that in sequence is
 * enough to make a suite you stop running.
 *
 * So the default is a virtual display: `xvfb-run` gives Xvfb its own screen, the windows are
 * real, and nothing appears on the desktop. A failing run still leaves traces, screenshots
 * and the Playwright report, so nothing is lost by not watching.
 *
 * `--headed` opts back into the real display, for the times watching is the point.
 *
 * Anything else on the command line is forwarded to Playwright, so the usual escapes work:
 *
 *     pnpm e2e -- install.spec.ts
 *     pnpm e2e -- --grep "rollback"
 *     pnpm e2e --headed -- install.spec.ts
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const argv = process.argv.slice(2);
const headed = argv.includes("--headed");
// `pnpm e2e -- foo` arrives as `-- foo`; drop the separator rather than forwarding it.
const forwarded = argv.filter((arg) => arg !== "--headed" && arg !== "--");

/** Whether an executable is reachable through PATH, without asking a shell. */
function onPath(name) {
  const entries = (process.env.PATH ?? "").split(":");
  return entries.some((entry) => entry.length > 0 && existsSync(join(entry, name)));
}

const playwright = join(root, "node_modules", ".bin", "playwright");
if (!existsSync(playwright)) {
  console.error("playwright is not installed here. Run `pnpm install` first.");
  process.exit(1);
}

/**
 * A display, or an explanation of why the windows are about to appear.
 *
 * Deliberately not a fallback that pretends: running the suite on the real display when
 * nobody asked for it is the behaviour this script exists to stop. If neither a display nor
 * `xvfb-run` is available, say so and run anyway — the person may be on a headless box where
 * a failing test is worth more than a clean desktop.
 */
function invocation() {
  if (headed) {
    return { command: playwright, args: ["test", ...forwarded], note: null, env: process.env };
  }

  // A virtual display is not enough on a Wayland session, which is now the common case on
  // KDE and GNOME. `xvfb-run` sets DISPLAY, but Chromium's Ozone auto-detection prefers
  // Wayland whenever WAYLAND_DISPLAY is set — so the windows were created on the real
  // compositor and Xvfb was never used. Removing the variable is what actually makes the
  // run headless; setting it back is what `--headed` does.
  const isolated = { ...process.env };
  delete isolated.WAYLAND_DISPLAY;
  // Two variables, because Chromium's Ozone auto-detection consults both. Removing the
  // Wayland socket alone is not enough — `XDG_SESSION_TYPE` still says "wayland", so Electron
  // tries to connect to a socket that is not there and dies with "The platform failed to
  // initialize". Saying "x11" is what makes Xvfb the display the windows are drawn on.
  // Measured, not assumed: `ELECTRON_OZONE_PLATFORM_HINT` and `--ozone-platform-hint` are both
  // ignored by this Electron build, and `--ozone-platform=x11` works but has to be injected
  // into every app's argv, which the apps would then interpret as a document to open.
  isolated.XDG_SESSION_TYPE = "x11";
  // Which tells the fixtures to launch Electron without a GPU. There is no GPU behind Xvfb,
  // and Electron 45 treats a failed GPU process as fatal: "GPU process isn't usable."
  // Software rendering is what the apps use for the rest of the run anyway.
  isolated.SUITE_E2E_HEADLESS = "1";

  if (onPath("xvfb-run")) {
    return {
      command: "xvfb-run",
      // `-a` takes the first free display number, so two runs cannot collide.
      args: ["-a", playwright, "test", ...forwarded],
      note: "headless (Xvfb). `pnpm e2e --headed` to watch.",
      env: isolated,
    };
  }

  if (process.env.DISPLAY) {
    return {
      command: playwright,
      args: ["test", ...forwarded],
      note: "xvfb-run is not installed, so the windows will open on your display.",
      env: isolated,
    };
  }

  return {
    command: playwright,
    args: ["test", ...forwarded],
    note: "no display and no Xvfb.",
    env: isolated,
  };
}

const { command, args, note, env } = invocation();
if (note !== null) console.log(`▶ ${note}\n`);

const child = spawn(command, args, { cwd: root, stdio: "inherit", env });
child.on("error", (error) => {
  console.error(`could not start the suite: ${error.message}`);
  process.exit(1);
});
child.on("close", (code, signal) => {
  process.exit(signal !== null ? 1 : (code ?? 1));
});
