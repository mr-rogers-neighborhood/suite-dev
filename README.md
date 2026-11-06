# Suite Dev

The developer workspace for Suite. One command runs the hub, the sync server and the real app
binaries together; one VS Code window holds all five repositories.

This repository owns no product code. It assumes the product repositories are cloned beside it:

```
Desktop/suite/
  suite-start/     the hub
  suite-sync/      protocol + server
  suite-canvas/    canvas (web + desktop)
  suite-planner/   planner
  suite-budget/    budget
  suite-dev/       ← this repo
```

## First run

```sh
cd suite-dev
pnpm install
pnpm preflight          # what is present, what is missing
pnpm apps:stage         # build + electron-builder --dir for all four apps
pnpm seed               # workspace ids, membership, Demo.canvas
```

Then pick a loop:

```sh
pnpm dev                # Vite + electron .  (edit-reload)
pnpm dev:staged         # the real binaries
pnpm demo:sync          # two hubs, two members, one workspace
pnpm e2e                # the cross-app Playwright suite
```

`pnpm stop` kills anything an earlier run left behind.

## The command matrix

| Command             | What runs                                                   | When                                                                |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`          | sync server + Vite + `electron .`                           | you are editing the renderer or the shell                           |
| `pnpm dev:staged`   | sync server + staged Start + staged apps                    | "does the packaged app work?"                                       |
| `pnpm demo:sync`    | sync server + two staged Starts (owner/editor)              | manual sync testing                                                 |
| `pnpm e2e`          | staged binaries under Playwright                            | regression                                                          |
| `pnpm apps:stage`   | build + `electron-builder --dir`, copy to `.dev/apps`       | after a code change you want in the binaries                        |
| `pnpm seed`         | `suite-sync workspace init`, `Demo.canvas`, install records | first run, or `--force` for new ids                                 |
| `pnpm preflight`    | checks the toolchain, siblings, binaries, ports, display    | something does not start                                            |
| `pnpm link:local`   | `pnpm link` the shared packages into the apps               | you are editing `@suite/contracts`, `@suite/files` or `@suite/sync` |
| `pnpm unlink:local` | restores the released specifiers                            | before you commit                                                   |
| `pnpm stop`         | kills recorded service pids                                 | a run was hard-killed                                               |

`pnpm doctor` is the same as `pnpm preflight`, but pnpm resolves `doctor` to its own built-in command.
Use `pnpm preflight`; the alias only works as `pnpm run doctor`.

## What "real binary" means here

`pnpm apps:stage` runs each app's `build`, then `electron-builder --dir`. The result is the unpacked
application: the same ASAR, `suite.app.json` beside the executable, the same `files` and
`extraResources`. Start reads the same `installs.json` an installer would have written.

One fuse is deliberately loosened in a staged copy: `enableNodeCliInspectArguments`. Playwright attaches
to the Electron main process over the Node inspector, and the shipped fuse turns that off. Every other
fuse stays on. To build the exact shipped article for a manual check:

```sh
pnpm apps:stage -- --strict-fuses
```

That build cannot be driven by `pnpm e2e`; boot it by hand.

## The `.dev` directory

Everything a run creates lands here, and it is gitignored:

```
.dev/
  env.json               workspace, member and port ids (stable across runs)
  apps/<id>/             the staged unpacked app, one per app
  data/<app>-<profile>/  userData per app and profile
  start-data/<profile>/  installs.json + recents.json per Start profile
  documents/<profile>/   SUITE_START_DOCUMENTS, with Demo.canvas inside Canvas/
  workspace/             suite-sync membership.json + snapshot.loro
  logs/                  one log file per service
  pids/                  live service pids, so `pnpm stop` can find them
```

Isolation is the point: the harness never reads or writes `~/Documents/Suite` or the real
`~/.config/Suite *`.

## Why two profiles

The single-instance lock lives in `userData`, and the document lock is per file. Two members therefore
need two Start profiles, each with its own `SUITE_START_USER_DATA` and its own copy of `Demo.canvas`.
The sync server is the only shared piece, which is exactly the shape a real user has.

The member env (`SUITE_SYNC_URL`, `SUITE_SYNC_MEMBER`, `SUITE_SYNC_WORKSPACE`, `SUITE_SYNC_EPOCH`) is
read by the desktop shell and passed to the renderer. Start passes its environment to the apps it
spawns, so one Start profile is one member.

## One folder

Open [suite.code-workspace](suite.code-workspace). It lists the five repositories, hides `.dev`, `dist`
and `release` from search, and sets the terminal to this folder. Tasks and launch configurations are in
[.vscode](.vscode):

- tasks: preflight, stage, seed, dev, dev:staged, demo:sync, e2e, stop;
- launch: `Start (staged)`, `Canvas (staged, owner)`, `Sync server`, and a `Sync demo` compound.

`Start (staged)` and `Canvas (staged, owner)` set `--inspect` so the main process can be debugged. That
is why the staged build loosens that one fuse.

## Shared packages

Canvas, Planner and Budget install `@suite/contracts`, `@suite/files` and `@suite/sync` from a git tag.
When you are editing one of those packages:

```sh
pnpm link:local          # pnpm link the siblings into the consumers
# edit, run the apps, repeat
pnpm unlink:local        # restores the original package.json + pnpm-workspace.yaml
pnpm link:check          # which consumers are on a link, which on a tag
```

`link` snapshots the original files under `.dev/link/<repo>/`. `unlink` refuses to restore a file that
changed since the link, so a hand edit is never clobbered. Never commit a `link:` specifier.

## How the runner works

`scripts/lib/proc.mjs` is the whole process model:

- each service runs in its own process group, so one signal reaches `pnpm`, Vite and Electron;
- output is prefixed with `[sync]`, `[canvas]`, `[start-owner]` and tee'd to `.dev/logs/`;
- the pid is written to `.dev/pids/`, so `pnpm stop` can clean up after a hard kill;
- `up` waits for `/health` before opening a window, and fails with the log tail when a service dies.

No new runtime is required: Node only, same as the per-repo scripts it replaces.

## Troubleshooting

| Symptom                               | Cause                                | Fix                                             |
| ------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| `missing sibling repositories`        | a repo is not cloned beside this one | clone it, rerun                                 |
| `Start is not staged`                 | `apps:stage` has not run             | `pnpm apps:stage`                               |
| `EADDRINUSE`                          | a previous run survived              | `pnpm stop`, rerun                              |
| No window, no error                   | no display                           | set `DISPLAY`, or `xvfb-run -a pnpm dev:staged` |
| Playwright cannot attach              | a `--strict-fuses` build             | restage without it                              |
| `pnpm doctor` runs pnpm's own command | name collision                       | `pnpm preflight`                                |
| Two windows fight over a file         | same `Demo.canvas` path              | use the owner/editor profiles                   |

Read [manual testing](docs/how-to/manual-testing.md) for the click-by-click, and
[e2e](docs/how-to/e2e.md) for the harness.

## Licence

MIT, © Suite contributors.
