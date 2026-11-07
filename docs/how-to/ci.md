# Running the gate

There is no CI service. The gate runs on the machine that builds the releases — see
[ADR-0002](../adr/0002-the-gate-runs-here.md) for why.

## Before a push

Each repository installs a `pre-push` hook on `pnpm install`, and it runs that repository's own
`check`. Nothing else is needed: a push that would carry a red tree fails instead.

## The whole suite

```sh
cd suite-dev
node scripts/ci.mjs            # every gate, dependency order
node scripts/ci.mjs --e2e      # plus the cross-app suite (stages four binaries)
node scripts/ci.mjs --only suite-canvas
node scripts/ci.mjs --dry      # what it would run
```

`suite-sync` goes first because the apps pin its tags; a failure there explains the four that follow.

## The cross-app suite runs when you ask

It is too slow to sit in front of a push: it stages four real binaries, needs a display, and takes about
forty seconds once staged.

```sh
node scripts/ci.mjs --e2e
# or, against what is already staged:
DISPLAY=:1 xvfb-run -a pnpm e2e
```

There is no timer. It ran on a nightly systemd timer for exactly as long as it took to notice the timer
was never installed, and a file describing an automatic run nobody enabled is the same artefact as a
workflow that cannot start. Nothing detects a broken binary combination overnight; the binaries only
change when a release is cut, and that is already a deliberate manual act.

It earns its keep: this suite is what caught `ts-mls` importing `@noble/ciphers` without declaring it —
a crash that no unit test could see, because the workspace hoisted the package and only a packaged app
could miss it.

## Releasing is not the pipeline's job

The gate answers "is this repository healthy". It does not answer "is this release good", and the
signing key is not handed to a runner for it to try. A release is one command on the machine that holds
the key:

```sh
node scripts/release.mjs planner --publish
```

It runs the gate itself before it builds, so a release cannot skip what a push must pass. See
[cutting a release](release.md).

## If a hosted runner ever appears

The workflow files are in the git history — every one was validated with `actionlint` and none of them
was wrong. `git log --diff-filter=D -- .github/workflows` finds the commit that removed them.

## The Woodpecker pipeline

Every repository has a `.woodpecker.yaml`. It is one step, and it calls `pnpm check:full` — the same
command `scripts/ci.mjs` runs, so there is one definition of "this repository is healthy" rather than a
list here and a list there.

`check` stays the fast gate a push runs. `check:full` is what a runner runs, because `check` uses
`vitest run --changed` in the app repositories and that needs git history a container may not have.

### Running it with no server

```sh
# Once: the CLI is a single binary, and it must match the server's major version.
gh release download v3.20.1 --repo woodpecker-ci/woodpecker \
  --pattern "woodpecker-cli_linux_amd64.tar.gz" --clobber
tar xzf woodpecker-cli_linux_amd64.tar.gz
install -m 0755 woodpecker-cli ~/.local/bin/

# Then, from any repository:
woodpecker-cli exec --pipeline-event push --commit-branch main \
  --repo mr-rogers-neighborhood/suite-sync .woodpecker.yaml
```

The `when` filter is why the metadata flags are needed: without an event, every workflow is filtered out
and the CLI reports "no workflows to execute".

### Two things the first run teaches

**`exec` copies the tree without a usable `.git`.** That is by design — it is for testing pipeline steps,
not for being a runner. The committed-output check cannot compare against history there, so it says
`check-dist: skipped — git cannot see a work tree here` rather than passing quietly. A Woodpecker
_server_ clones with git, so the check does run there.

**The container writes back as root, and it writes into `node_modules` too.** A run leaves build output
_and_ installed packages owned by root — 5,490 files in `suite-sync` and 68,644 in `suite-planner` after
one pass each. The next `pnpm install` then fails with `EACCES`, and the failure names a path inside
`node_modules/.pnpm` rather than the container that caused it.

Take ownership back rather than deleting anything:

```sh
docker run --rm -v "$PWD:/w" alpine chown -R "$(id -u):$(id -g)" /w
```

Check with `find . -user root -not -path "./node_modules/*"`. If that returns anything, a container wrote
to this checkout, and the next confusing error is probably that.

### When a server becomes worth it

It buys two things the CLI cannot: a trigger that is not your laptop, and a history with notifications.
Both need the forge to reach the server, so the setup is:

1. `woodpecker-server` + `woodpecker-agent` (SQLite is fine at this size), on a machine that is on when
   you push.
2. **A Cloudflare tunnel** for the webhook endpoint — outbound-only, no port forwarding, revocable.
3. A GitHub OAuth app, because the forge connection is how Woodpecker authenticates and reports status.
4. **Approval required for pull requests from outside contributors.** The repositories are public, and a
   fork PR otherwise runs that fork's code on your machine.
5. **Never the signing key.** Not in a secret, not on the agent. Releases stay a deliberate manual act.

None of that is done, deliberately: it is a server to patch, a database to back up, and a tunnel
credential — for a benefit that a second contributor or a second machine would make real.
