# Suite Dev

The developer workspace for Suite. One command runs the hub, the sync server and the real app
binaries together; one VS Code window holds all five repositories.

This repository owns no product code. It assumes the product repositories are cloned beside it:

---

## If you are deciding whether to trust this

Four pages, in the order they answer the question:

- [Status](docs/STATUS.md) — what works, what is missing, per subsystem, with no percentages.
- [What exits alpha](docs/ALPHA.md) — the definition, and a checklist that can be pointed at.
- [Roadmap](docs/ROADMAP.md) — what is next, what "done" means for each item, and how priorities
  are labelled.
- [Verifying a download](docs/how-to/verify.md) — three checks, one minute.

---

Developer note:

**What is Suite?**

Suite is a collection of applications, a relay for sync and collaboration, and a toolbox for updating and managing your applications.

This architecture came from trying basically every application worth trying in its respective space and being left wanting. I can't claim to have replaced these applications, but I'm building my own that provide the feature sets I need. They're released open-source under the MIT license, local-first, and easy to install and manage from your own computer. Mobile applications are out of scope for now, but will come once there's a solid foundation. If these applications are useful to you, you're free to use them however you'd like, or fork and develop them into your own suite.

Applications I've tested in the past include knowledge management tools and outliners such as Obsidian, Notion, Capacities, Heptabase, Tana, Logseq, and AnyType. They also include planners and task management tools such as Sunsama, Akiflow, Todoist, and TickTick, as well as budgeting applications such as YNAB and Actual.

Each of these has something going for it that the others don't, and every one is missing a critical set of capabilities I'd want from that kind of application: a simple, local-first, integrated sync service, and flexible, deep collaboration features. Some are free and open-source, even local-first; others are tied entirely to the cloud and an internet connection. None contain the exact set of capabilities I want for a visual note-taking and research application.

That led to Suite Canvas, originally the only application in the collection. Suite Canvas combines the typed-object-graph model from apps like Capacities with the canvas-driven, research-oriented experience of Heptabase. It takes smaller influences from other applications on the list, and from some that aren't (such as a generalized version of Tana's Supertags). It's the most mature of the bunch, though still very much in alpha.

I've tried to build something like Canvas several times, and each attempt hit scope creep or a design wall that led me to abandon or restart it. Approaches that didn't work out:

- **Canvas as a CMS.** A tool for thinking always becomes constrained by the language and thought process of web design. People don't think in routes or views, and mashing the two languages together produced something confusing and not worth using. Adding mapping between the CMS and the canvas didn't help either (I carried over, and still maintain, many architectural ideas from WordPress plugins like Advanced Custom Fields, Metabox, and Pods). It was clunky and felt like using two separate applications that don't mix.
- **Infinite canvas.** It seems ideal, and I love the infinite-zoom drawings people make. I tried ICE, an experimental canvas engine, and PixiJS. Both looked striking and had genuinely impressive features (ICE let you arrange cards fractally, for example), but they were complexity tar pits that forced the entire application design to contort around them. That's before getting into accessibility, sync and collaboration, and also navigation: it predictably makes it very easy to get lost. Good for art, not clear that it is good for a structured thinking tool. I did end up integrating excalidraw, via the "Sketch" card type and embed, so you maintain the important bit of being able to draw and sketch on an infinite canvas, and then embed it in your non-infinite canvas. I also added the "Portal" card type, a way to link from one canvas board to another. These were more comprehensive and easily justified expansions.
- **No-code/low-code systems and computational notebook features.** These seem ideal too, but they cause both classes of problems above and worse ones. You lose the ability to arbitrarily rearrange your thoughts, because your links and cards now mean something beyond simple data. The result can be as striking as an infinite canavas (I even had links animate to show you the data-flow directly), but in my attempts it wasn't useful, just looked cool.

None of these experiments were pointless. Each revealed insights I didn't have before and taught me something about software design.

Suite Planner, Suite Budget, and the surrounding tooling (Suite Start and Suite Sync) came from realizing I can't fit all of these application types onto a canvas interface. I tried, and hit the the third design wall mentioned above. It was too complex, too deep, and too over-engineered to be functional and usable, let alone shippable.

So the applications are split into three that match their domains. A canvas is a thinking and research tool. A planner is a task, project management, and calendaring tool. A budget is a budgeting tool. I plan to experiment with integrations (embedding your calendar or budget into your canvas, or attaching your canvas to your calendar or budget, for example), but those features need to be considered deeply to actually be useful.

In the end, you should have a canvas, a planner, and a budget: all simple and easy to use, all with integrated and easy-to-run sync and update services, and none of them requiring you to connect to a centralized server or cloud service to use, at all. That's what will make Suite pretty sweet.

---

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
