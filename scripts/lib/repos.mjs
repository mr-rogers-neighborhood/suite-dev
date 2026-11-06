import { existsSync } from "node:fs";
import { join } from "node:path";
import { sibling } from "./paths.mjs";

/**
 * The four applications the hub can list.
 *
 * `project` is the folder whose `package.json` carries the `package:dir` script;
 * `executable` is the binary electron-builder names. `manifest` says whether the
 * app ships a `suite.app.json` beside that binary, which is what Start reads.
 */
export const APPS = [
  {
    id: "start",
    name: "Suite Start",
    repo: "suite-start",
    project: "apps/start",
    package: "@suite/start",
    executable: "suite-start",
    manifest: false,
    userDataEnv: "SUITE_START_USER_DATA",
    documentsEnv: "SUITE_START_DOCUMENTS",
    libraryEnv: null,
    documentsFolder: null,
  },
  {
    id: "canvas",
    name: "Suite Canvas",
    repo: "suite-canvas",
    project: "apps/desktop",
    package: "@suite/desktop",
    executable: "suite-canvas",
    manifest: true,
    userDataEnv: "SUITE_CANVAS_USER_DATA",
    documentsEnv: null,
    libraryEnv: "SUITE_CANVAS_LIBRARY",
    documentsFolder: "Canvas",
  },
  {
    id: "planner",
    name: "Suite Planner",
    repo: "suite-planner",
    project: "apps/desktop",
    package: "@suite/planner",
    executable: "suite-planner",
    manifest: true,
    userDataEnv: "SUITE_PLANNER_USER_DATA",
    documentsEnv: null,
    libraryEnv: "SUITE_PLANNER_LIBRARY",
    documentsFolder: "Planner",
  },
  {
    id: "budget",
    name: "Suite Budget",
    repo: "suite-budget",
    project: "apps/desktop",
    package: "@suite/budget",
    executable: "suite-budget",
    manifest: true,
    userDataEnv: "SUITE_BUDGET_USER_DATA",
    documentsEnv: null,
    libraryEnv: "SUITE_BUDGET_LIBRARY",
    documentsFolder: "Budget",
  },
];

export const APP_IDS = APPS.map((app) => app.id);

export function appById(id) {
  return APPS.find((app) => app.id === id) ?? null;
}

export const SIBLING_REPOS = [
  "suite-start",
  "suite-sync",
  "suite-canvas",
  "suite-planner",
  "suite-budget",
];

export function missingSiblings() {
  return SIBLING_REPOS.filter((name) => !existsSync(sibling(name)));
}

export function repoDir(app) {
  return sibling(app.repo);
}

export function projectDir(app) {
  return join(sibling(app.repo), app.project);
}

export function releaseDir(app) {
  return join(projectDir(app), "release");
}

/**
 * The environment one app needs to use a profile's documents and its own data.
 *
 * Start gets the documents root; an app gets the folder inside it. A separate
 * userData per profile is what lets two copies run at once, because the
 * single-instance lock lives there.
 */
export function appProfileEnv(app, { documentsRoot, userDataRoot, startDataRoot }) {
  const env = { [app.userDataEnv]: join(userDataRoot, app.id) };
  if (app.documentsEnv !== null) env[app.documentsEnv] = documentsRoot;
  if (app.libraryEnv !== null) {
    env[app.libraryEnv] = join(documentsRoot, app.documentsFolder ?? app.name);
  }
  if (app.id === "start") env.SUITE_START_DATA = startDataRoot;
  return env;
}
