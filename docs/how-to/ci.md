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

## Nightly

The cross-app suite is too slow to sit in front of a push, so it runs on a timer:

```sh
cp suite-dev/ops/suite-ci.service ~/.config/systemd/user/
cp suite-dev/ops/suite-ci.timer  ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now suite-ci.timer
systemctl --user list-timers suite-ci.timer
journalctl --user -u suite-ci.service -n 50
```

It needs the machine awake. A missed night is a missed night and nothing depends on it.

## If a hosted runner ever appears

The workflow files are in the git history — every one was validated with `actionlint` and none of them
was wrong. `git log --diff-filter=D -- .github/workflows` finds the commit that removed them.
