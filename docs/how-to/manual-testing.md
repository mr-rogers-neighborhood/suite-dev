# Manual testing

Three loops, from fastest to most faithful. All of them keep their data in `suite-dev/.dev`.

## 1. The hub and the real apps

```sh
pnpm preflight
pnpm apps:stage
pnpm seed
pnpm dev:staged
```

What to look for:

- Start opens on **Apps**, with three cards: Canvas, Planner, Budget.
- Each card shows the version from its own `suite.app.json` and a file count.
- **Files** lists `Demo.canvas` under Canvas.
- Open it: a real `suite-canvas` process starts. In the window, the title bar says **Saved** rather
  than **Local only**, because the sync env is set.
- Close Canvas; Start stays open.

If a card says a reason instead of an Open button, the manifest beside the staged binary is wrong or
missing. `pnpm preflight` names it.

## 2. Two members, one workspace

```sh
pnpm demo:sync
```

What to look for:

- Two Start windows open, each with its own `Demo.canvas`.
- `curl http://127.0.0.1:8787/health` reports `"clients": 2`.
- Create a card in one window; it appears in the other.
- Rename a card; the title changes in both.
- Move a card; the position changes in both.

Stop the server (`Ctrl-C` in that terminal, or `pnpm stop`) and start `pnpm demo:sync` again with the
windows still open. The server reloads `snapshot.loro`; a third window catches up.

## 3. The edit loop

```sh
pnpm dev
```

This is the same desktop shell, but the renderer comes from Vite and the main process watches its own
output. An edit to a component appears without a restart; an edit to `apps/desktop/src/main` restarts
the window.

The sync env is set here too, so a second `pnpm dev` on another terminal joins the same room as a
different member only if you override `SUITE_SYNC_MEMBER`; by default both are the owner.

## Reading the state

| Where                                     | What                              |
| ----------------------------------------- | --------------------------------- |
| `curl http://127.0.0.1:8787/health`       | `rooms`, `clients`                |
| `.dev/logs/sync.log`                      | relay and room lifecycle          |
| `.dev/logs/start-owner.log`               | the hub's own output              |
| `.dev/env.json`                           | workspace id, member ids, ports   |
| `.dev/workspace/snapshot.loro`            | the server's copy of the document |
| `.dev/start-data/<profile>/installs.json` | exactly what Start will launch    |

## Things that are expected to fail

- Two windows on **the same** `Demo.canvas` path: the one-writer lock refuses the second. Use two
  profiles, each with its own copy.
- A `--strict-fuses` build under Playwright: the inspector fuse is off on purpose.
- A second `pnpm dev` on the same port: the runner discovers a free port and writes it to
  `.dev/env.json`; read the URL it printed.
