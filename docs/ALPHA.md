# What exits alpha means

The apps already say this on first launch: the tests pin down behaviour, not the maintainers'
complete understanding of it. This page turns that sentence into something that can be checked,
because a status you cannot test is a mood.

Alpha is not a feature count. It exits when the **cognitive debt** is paid down — the gap between
what the tests prove and what a person can reason about. A suite with fewer features that a
maintainer can hold in their head is further along than a larger one that only the tests understand.

## The checklist

Every line must be true. None of them is "more tests" — that is already the gate.

### 1. Every subsystem is covered by a test that has failed at least once

Not "is tested". _Has failed_. A test that has never been red has not been shown to be capable of
catching anything. This is why the install/update/uninstall path is described in
[Status](STATUS.md) as Working and the sync identity flow as Missing: one of them has been proven by
breaking it.

### 2. A person can leave without losing anything

- Uninstalling an app removes its binary, its menu entry, its icon and its record, and touches no
  document. **(done, asserted by test)**
- Uninstalling the hub leaves the apps it installed working. **(done)**
- Every path that matters is visible in Settings rather than inferable. **(done)**
- A bad update can be undone without a network. **(done — one step back is kept)**

### 3. The failure modes are written down, not discovered

Each app's log says what it did and why, in sentences a person can read. A skip is logged with its
reason. A refusal says what was refused. **Partial** — the update path does this; sync does not yet.

### 4. There is nothing a maintainer would have to re-derive from the tests

This is the honest one, and the reason this page exists. The measure is not "could someone fix a
bug" but "could someone predict where the next bug is". When reading a module makes you open its
test file to understand it, that module is not finished.

### 5. Nothing in the product depends on a service the project cannot run

No account, no hosted control plane, no telemetry endpoint that must stay up. **Done** — this is
already the architecture, and it is the reason the rest of the checklist is worth doing.

### 6. A release is boring

One command, refuses a dirty tree, runs the gate, signs the feed, and produces a changelog entry
written for people. **Done** — see [cutting a release](how-to/release.md).

## What alpha costs you today

Being explicit, so nobody is surprised:

- A workspace cannot be shared with another person without a CLI step.
- The relay only runs on a desktop.
- Planner and Budget do not sync yet.
- The apps carry no upgrade guarantee between versions. Export before you rely on a document.

## When it changes

This page changes when the checklist does, in the same commit. If a line here and the code disagree,
the code is right and the line is a bug.
