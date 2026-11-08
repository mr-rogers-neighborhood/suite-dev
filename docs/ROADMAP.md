# Roadmap

Easy to keep updated: one list, newest thinking at the top, and every item states what "done" means.
When something here ships, it moves to [Status](STATUS.md) and its line is deleted — a roadmap that
keeps finished work in it stops being read.

## Next

**1. A relay you can leave running.** `suite-sync` ships as a standalone headless binary with a
systemd unit, so a NAS or a Raspberry Pi can hold the mailbox. Today the relay only runs inside
Suite Start, on a desktop.
_Done means:_ someone can install the relay on a machine with no display, point two devices at it,
and sync a workspace.

**2. Standalone app installs.** Each app ships an AppImage and a signed feed of its own, and works
when Start is not installed.
_Done means:_ a person who wants only Budget can install only Budget. Start becomes recommended,
not required.

**3. Invite and join.** A person can add another device or another person from inside the app, with
the recovery file doing the job it was designed for.
_Done means:_ no CLI step is needed to bring a second device into a workspace.

## After that

**4. Sync in Planner and Budget.** The transport exists and Canvas uses it; the other two do not.

**5. Suite website.** A single page at the project's domain, listing the apps, the roadmap and the
status. It should read the same content as [Status](STATUS.md) rather than become a second place to
update.

## Explicitly not planned

| Not doing                       | Why                                                                     |
| ------------------------------- | ----------------------------------------------------------------------- |
| macOS and Windows               | Both need a signing identity. An unsigned build is worse than no build. |
| A hosted service                | Suite operates no server. That is the product, not a limitation.        |
| Server-side search or rendering | The relay is blind: it cannot read what passes through it.              |
| A plugin ecosystem              | Nothing in the apps is shaped for third-party code yet.                 |

## How priorities are tracked

The live list is the [issues in this repository](https://github.com/mr-rogers-neighborhood/suite-dev/issues?q=is%3Aissue+is%3Aopen+sort%3Acreated-asc),
ordered by one priority label. The ordering below is the whole scheme — no points, no estimates, no
burndown.

| Label             | Means                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| `priority: now`   | The next release is blocked on it, or it breaks a promise the docs make. |
| `priority: next`  | Agreed and shaped, but nothing is blocked.                               |
| `priority: later` | Wanted, not shaped. Fine to leave here indefinitely.                     |

Anything without a label is a note, not a commitment.
