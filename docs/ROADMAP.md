# Roadmap

What is next, and what "done" means for each item. Finished work moves to [Status](STATUS.md)
and leaves this list.

## Next

**1. A relay you can leave running.** `suite-sync` as a standalone headless binary with a systemd
unit, so a NAS or a Raspberry Pi can hold the mailbox.
_Done means:_ the relay installs on a machine with no display, and two devices sync through it.

**2. Standalone app installs.** Each app ships an AppImage and a signed feed of its own, and works
without Start installed.
_Done means:_ a person who wants only Budget can install only Budget.

**3. Invite and join.** Add a device or another person from inside the app.
_Done means:_ no terminal step to bring a second device into a workspace.

## Later

**4. Sync in Planner and Budget.** The transport exists and Canvas uses it.

**5. A single page at the project's domain**, listing the apps, the status and the roadmap. It
should read the same content as [Status](STATUS.md) rather than duplicate it.

## Not planned

| Not doing                       | Why                                                                     |
| ------------------------------- | ----------------------------------------------------------------------- |
| macOS and Windows               | Both need a signing identity. An unsigned build is worse than no build. |
| A hosted service                | Suite operates no server. That is the product.                          |
| Server-side search or rendering | The relay is blind; it cannot read what passes through it.              |

## Priorities

Open work lives in [the issue list](https://github.com/mr-rogers-neighborhood/suite-dev/issues),
ordered by one label.

| Label             | Means                                                     |
| ----------------- | --------------------------------------------------------- |
| `priority: now`   | Blocks the next release, or breaks a promise in the docs. |
| `priority: next`  | Agreed and shaped. Nothing is blocked on it.              |
| `priority: later` | Wanted, not shaped.                                       |
