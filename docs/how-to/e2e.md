# The cross-app e2e suite

`pnpm e2e` runs Playwright against the **staged binaries**, not the source. The per-repo suites still
cover their own app; this one covers the seams.

## Before it runs

```sh
pnpm install
pnpm apps:stage     # the suite launches .dev/apps/*
pnpm e2e
```

A Linux machine with no display:

```sh
xvfb-run -a pnpm e2e
```

If a previous run was killed, `e2e/fixtures/global-setup.ts` calls `stopStale()` first.

## The fixtures

[e2e/fixtures/suite.ts](../../e2e/fixtures/suite.ts):

| Helper                                                 | What it does                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `tempWorkspace()`                                      | a temp workspace: ids, `membership.json`, `snapshot.loro`, two `Demo.canvas` copies |
| `startServer(workspace)`                               | a `suite-sync serve` on a free port, waited on `/health`                            |
| `launchCanvas({ workspace, profile, port, memberId })` | a staged Canvas with its own `userData`, library and member                         |
| `launchStart({ root })`                                | a staged Start with its own data and documents roots                                |
| `createNote(page, title)`                              | the dock → Note gesture, then the title                                             |

Every helper keeps its state in a temp directory. The suite does not reuse `.dev`: a card from the last
run would make "did it sync?" pass before the transport ran.

## The specs

| Spec                                | Proves                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `hub-discovers.spec.ts`             | the staged hub reads the staged manifests and the seeded file                  |
| `sync-two-members.spec.ts` (first)  | a card created by the owner reaches the editor, and `/health` sees two clients |
| `sync-two-members.spec.ts` (second) | a server restart keeps the document and a new client catches up                |

## Adding a spec

1. Get a workspace with `tempWorkspace()`.
2. Start a server with `startServer()`.
3. Launch the app with `launchCanvas()` or `launchStart()`.
4. Assert on what a person would see, then close everything in `finally`.

Keep the tests serial. Each one owns a server port and a temp workspace, but the process table is
shared, and a parallel run only makes a failure harder to read.

## Why the binaries, not the source

The hub launches whatever `installs.json` names, and the packaged app resolves its dependencies from
the ASAR. A source run cannot catch a missing production dependency or a manifest that `extraFiles`
forgot. This suite caught both.

The one deliberate difference from a shipped build is `enableNodeCliInspectArguments`: Playwright needs
the main-process inspector. `pnpm apps:stage -- --strict-fuses` builds the shipped article, which this
suite cannot drive.
