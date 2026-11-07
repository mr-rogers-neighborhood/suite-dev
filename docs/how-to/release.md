# Cutting a release

One command, run from this repository, on the machine that holds the signing key.

```sh
node scripts/release.mjs planner
```

That is the whole release. It runs the app's own gate, builds what `package.json` says, packages a
Linux AppImage, signs the feed manifest, and tells you what it would upload. Adding `--publish` uploads
it; adding `--feed-dir` writes the same three files into a folder instead, which is how an install can
be proven without a network.

```sh
node scripts/release.mjs planner --feed-dir /tmp/feed          # a local feed, nothing published
node scripts/release.mjs planner --publish --notes-file notes.md
node scripts/release.mjs start --tag start-v0.3.0 --publish    # the hub, off the package tag line
```

## What it refuses

| Refusal                                      | Why                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The app's tree is dirty                      | The artifact would carry work nobody reviewed. Commit or stash first.                                                       |
| `package.json` and `suite.app.json` disagree | The version, the manifest and the tag describe one commit. Two of them saying different things is the failure this catches. |
| The gate fails                               | `check:full` — the same command the pipeline runs — is run first. "The gate passed" is seen, not remembered.                |

The version always comes from `package.json`, never from `git describe`. Suite Canvas carries
`v1.0.0`–`v1.1.0` tags from an older layout above its current `v0.1.0`, so tags cannot be trusted to
name a version.

## The tag

The default is `v<version>`. That is right for Canvas, Planner and Budget, whose tags are their own
releases. In `suite-start` it is wrong: `v0.1.0`–`v0.7.0` are the shared-package line the apps pin, and
the hub app is `0.3.0`, so the default collides with a tag about something else. The hub releases under
`start-v<version>` — `--tag start-v0.3.0`.

`releases/latest/download` resolves to the newest release whatever it is called, so the feed URLs do
not care.

## What it produces

In the app's `release/` directory:

- `Suite <App>-<version>.AppImage` — the artifact;
- `latest-linux.yml` — the feed: version, file name, sha512, size;
- `latest-linux.yml.sig` — the publisher's signature over those exact bytes.

The artifact name is set in each app's `electron-builder.yml` and has **no spaces**: GitHub rewrites a
space in an asset name to a dot, so a file built as `Suite Start-0.3.0.AppImage` is served as
`Suite.Start-0.3.0.AppImage` while the signed feed still names the file it built — a 404 for every
install. `suite-canvas-${version}-${arch}.${ext}` is the shape to follow.

All three are uploaded together. A feed without its signature is a feed every install refuses, and an
artifact without its feed is a version nothing can find.

## Publishing

`--publish` runs `gh release create v<version>` with the three files. Notes come from
`--notes-file`, or from GitHub's generated notes.

Nothing here runs in the pipeline, and `.woodpecker.yaml` does not call it. The pipeline answers "is
this repository healthy"; a release is a deliberate act on one machine, because that is where the key
is. See [ADR-0002](../adr/0002-the-gate-runs-here.md) and the signing section of an app's own
`docs/how-to/release.md`.

## The key

`~/.config/suite/update-key.pem`, or wherever `SUITE_UPDATE_KEY` points. It is not in any repository
and must not be. Back it up somewhere you control: anyone holding it can push an update to every
install, and losing it means no further updates for anyone running the pinned public key.

`scripts/sign-release.mjs` prints the public half's fingerprint after signing, which is how you check
that what you signed with is what the apps pin (`SUITE_UPDATE_PUBLIC_KEY` in `@suite/desktop`).
