# Running the gate

There is no CI service, and that is a decision rather than a gap. See
[ADR-0002](../adr/0002-the-gate-runs-here.md).

The reason is worth stating once, because it keeps getting rediscovered: GitHub Actions fails on this
account at startup, before any step runs. It is an **education entitlement that lapsed**, not billing
and not a YAML problem. A workflow that cannot start looks like a gate and is a comment, so the gate
moved to the machine that builds the releases.

## Before a push

Each repository installs a `pre-push` hook on `pnpm install`, and it runs that repository's own
`check`. Nothing else is needed: a push that would carry a red tree fails instead.

A fresh clone has no hook until `pnpm install` runs. A clone nobody installs is never gated, which is
the trade every hook-based setup makes.

## The whole suite

```sh
cd suite-dev
node scripts/ci.mjs            # every gate, dependency order
node scripts/ci.mjs --only suite-canvas
node scripts/ci.mjs --dry      # what it would run
```

`suite-sync` goes first because the apps pin its tags; a failure there explains the four that follow.
`suite-go` is in the list because it pins the same `@suite/theme` and `@suite/ui`: a break in the
shared packages reaches the desktop through the phone as easily as the other way round.

## Proving a commit, not a working tree

`check:full` answers "does this tree pass". It cannot answer "does this commit pass", because a warm
`node_modules`, a gitignored `.env` or a stale `dist` can all make a broken commit green. A hosted
runner would have made that stronger claim; this is how the claim is made without one:

```sh
node scripts/ci.mjs --fresh                    # every repository
node scripts/ci.mjs --fresh --only suite-sync
```

It exports `HEAD` with `git archive` into `.dev/ci-fresh/<repo>`, installs from the lockfile there,
and runs the gate against the result. A `git archive` contains tracked files only, so the three
things that can hide a failure are absent by construction.

**What it proves, precisely.** The repository's own commit passes from a clean export with a clean
install and no build output. It is not a hermetic clone: Canvas declares `@suite/desktop` and
`@suite/sync` as `link:../suite-*`, and those resolve against the working tree, so a mid-edit sibling
can influence its result. Repositories that pin by git tag are unaffected.

A passing export is deleted. A failing one is kept and its path printed, because it is the only copy
of the tree the failure came from.

**It earns its keep.** On its first run it found that the documentation index could not be verified
outside a checkout at all: the rows are dated by commit and ordered by the timestamp within that day,
which the index does not store, so any export either failed the comparison or rewrote real dates to
the moment it unpacked. That is fixed; the check now skips in a tree with no history, for the same
reason `check-dist` does.

## The cross-app suite runs when you ask

```sh
node scripts/ci.mjs --e2e
# or, against what is already staged:
DISPLAY=:1 xvfb-run -a pnpm e2e
```

It is too slow to sit in front of a push: it stages four real binaries, needs a display, and takes
about forty seconds once staged. There is no timer. It ran on a nightly systemd timer for exactly as
long as it took to notice the timer was never installed.

It earns its keep too: this suite is what caught `ts-mls` importing `@noble/ciphers` without declaring
it, a crash no unit test could see, because the workspace hoisted the package and only a packaged app
could miss it.

## Releasing is not the gate's job

The gate answers "is this repository healthy". It does not answer "is this release good", and the
signing key is not handed to anything that runs unattended. A release is one command on the machine
that holds the key:

```sh
node scripts/release.mjs planner --publish
```

It runs the gate before it builds, so a release cannot skip what a push must pass. It also refuses
when the version files disagree, which is how a tag once ended up naming a release whose artifact was
one version behind. See [cutting a release](release.md).

## Why there is no service

Three artefacts used to make a service look present, and all three are gone:

- **Six GitHub Actions workflows.** Removed. They never started once.
- **A `.woodpecker.yaml` in every repository.** Removed. Run locally, `woodpecker-cli exec` wrote
  **5,490 root-owned files in suite-sync and 68,644 in planner**, and the next `pnpm install` failed
  with `EACCES` naming a path inside `node_modules/.pnpm` rather than the container that caused it.
- **`.github/dependabot.yml`.** Removed. It is a service, and it opened pull requests that no gate
  could run against.

An accepted decision record in `suite-canvas` described a `pnpm ci` container pipeline as shipped.
It never existed: no such script was ever in `package.json` and `scripts/docker.mjs` has no history.
That record is withdrawn.

**What would change this.** Two things, and only two: a second contributor, at which point nothing
checks a pull request; or a second machine, at which point a gate that only one laptop can run stops
being a gate. Until then, adding a workflow file reintroduces the exact artefact ADR-0002 removed, and
the rule in `copilot-instructions.md` stands: never claim an external CI service gates `main`, name
the local command instead.

If a runner does become available, `git log --diff-filter=D -- .github/workflows` recovers the files
that were validated with `actionlint`. Nothing about them was wrong except that they never ran.
