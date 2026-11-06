# ADR-0002: The gate runs on this machine

- Status: accepted
- Date: 2026-11-06

## Context

The suite had six GitHub Actions workflows: one per repository running that repository's own `check`,
and one in `suite-dev` staging four real binaries and running the cross-app suite on a nightly timer.

None of them ran. Every job failed within two seconds with _"the job was not started because your
account is locked due to a billing issue"_ — an account-level condition that no workflow file can
address, and one that does not appear to correspond to an unpaid balance. A workflow that cannot run
is worse than no workflow: it looks like a gate, and it is a comment.

Meanwhile the gates themselves were finding real things whenever they were run by hand. Adding the
workflows surfaced four red ones that nothing had been running: two repositories failing `knip`, a
secret scan reading 94 MB of packaged build output, and Budget's own rule that its app makes no
network call — broken by the updater, and fixed by moving the network read into the shared package.

## Decision

**The gate runs where the releases are built.** Three pieces, no service:

1. **A pre-push hook in every repository**, running that repository's `pnpm check`. This is the part
   that replaces "a red tree cannot reach `main`". It is one command, it is the repository's own
   definition of healthy, and it fails the push rather than reporting afterwards.
2. **`scripts/ci.mjs` in this repository**, running every repository's gate in dependency order —
   `suite-sync` first, because the apps pin its tags — and stopping at the first failure with the step
   named. `--e2e` adds the cross-app suite.
3. **A systemd user timer** for the nightly run, which is where the e2e belongs: it stages four real
   binaries, needs a display, and is the one thing too slow to sit in front of a push.

The signing key stays where it already was. There is no CI secret, because there is no CI: the
publisher key lives at `~/.config/suite/update-key.pem` and is used by `scripts/sign-release.mjs` when
a release is made deliberately.

## Consequences

- A push from a machine with the hooks installed cannot carry a red tree. `git push --no-verify`
  skips it, and nothing else does.
- **Nothing checks a pull request.** In a single-person repository that is close to no loss; it stops
  being true the moment there is a second contributor, and this ADR is the thing to revisit then.
- A fresh clone has no hooks until `pnpm install` runs, because `prepare` installs them. A clone that
  is never installed is never gated, which is the same trade every hook-based setup makes.
- The nightly run needs the machine to be awake. A missed night is a missed night; it does not block
  anything, which is the point of it being separate from the push gate.
- The workflow files are in the history. If Actions becomes usable, `git show` recovers them and they
  were validated with `actionlint`; nothing about them was wrong except that they never ran.
