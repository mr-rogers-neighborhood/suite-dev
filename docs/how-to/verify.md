# Verifying what you downloaded

Two checks. Neither takes a minute.

## 1. Did the file arrive intact?

Every release publishes the file and a `latest-linux.yml` naming it with a SHA-512. Compare them
before running anything:

```sh
sha512sum suite-canvas-0.1.2-x86_64.AppImage
```

The value must match the `sha512:` beside the same file name in `latest-linux.yml`. A mismatch
that survives a second download is worth reporting.

This catches a broken download. It does not catch a poisoned release, because the same page
carries both halves — which is what the signature is for.

## 2. Is this the version you meant?

`latest-linux.yml` names one version, and `releases/latest/download/...` redirects to whatever
is newest. For a specific version, take the file from that version's own release page.

Suite Start can go back one version without downloading anything: after an update its card
offers the version that update replaced.

## What the apps do for you

Each desktop app verifies the feed signature before it installs anything, using a public key
pinned inside the app. Suite Start does the same before it installs an app. A feed that does not
verify is refused, and nothing is written.
