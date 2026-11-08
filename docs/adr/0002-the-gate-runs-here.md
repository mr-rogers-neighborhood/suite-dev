# ADR-0002: The gate runs on this machine

- Status: accepted
- Date: 2026-11-06

## Context

The suite had six GitHub Actions workflows: one per repository running that repository's own `check`,
and one in `suite-dev` staging four real binaries and running the cross-app suite on a nightly timer.

None of them ran. Every job failed within two seconds with _"the job was not started because your
account is locked due to a billing issue"_ — an account-level condition that no workflow file can
address. A workflow that cannot run is worse than no workflow: it looks like a gate, and it is a
comment.

**Cause, corrected 2026-11-08.** The message says billing; the actual cause is an **education
entitlement that lapsed**. The distinction matters for anyone reading this later deciding whether to
retry: this is not a payment to make, and re-adding a workflow before the entitlement is restored
reproduces the same failure. The lesson is unchanged and it is the one worth keeping: an account-level
condition is invisible from inside a repository, so a repository cannot be the place that proves it is
healthy.

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
3. **The cross-app suite on demand** — `node scripts/ci.mjs --e2e`. It stages four real binaries and
   needs a display, which is why it is not in front of a push, and it is not on a timer either: the
   timer was written, never installed, and removed rather than left claiming a run it never made.

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
- **Nothing runs the cross-app suite unless a person does.** The trade is real: no overnight detection of
  "these four binaries stopped working together". It is accepted because the binaries only change when a
  release is cut, and cutting a release is already a deliberate manual act. If it turns out to matter,
  the unit files are one `git show` away.
- The workflow files are in the history. If Actions becomes usable, `git show` recovers them and they
  were validated with `actionlint`; nothing about them was wrong except that they never ran.

## Recurrence

**2026-11-08.** Six workflow files were added back, one per repository, while working on unrelated
changes. They were removed the same day. The rule was already written down in three places — this
record, and `copilot-instructions.md` in three repositories, which says in as many words: *never claim
an external CI service gates `main`*. What made it easy to re-add anyway was the number of artefacts
that described a service as present:

- a `.woodpecker.yaml` in every repository, which is a valid pipeline config for a server that does
  not exist;
- a `ci.mjs` comment claiming to run the same command "the Woodpecker pipeline runs";
- `suite-go/AGENTS.md` saying Woodpecker runs the gate;
- an accepted decision record in `suite-canvas` describing a `pnpm ci` container pipeline as shipped,
  which was never in `package.json` and has no history.

All four are gone. The replacement for what they offered is `node scripts/ci.mjs --fresh`, which
proves a *commit* passes from a clean export rather than proving a working tree passes, and is the
claim a hosted runner would have made.

**Do not add a CI service back until the two conditions below are met.** A red mark that nothing can
act on is worse than no mark, and it is the specific artefact this record exists to prevent.
