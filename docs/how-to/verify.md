# Verifying what you downloaded

Three checks, in order, each answering a different question. None takes more than a minute, and
together they are the reason a signed feed is worth more than a download page.

You only need the first two unless something looks wrong.

## 1. Did the file arrive intact?

Every release publishes the file and a `latest-linux.yml` naming it with a SHA-512. Compare them
before you run anything:

```sh
sha512sum suite-canvas-0.1.2-x86_64.AppImage
```

The value must match the `sha512:` beside the same file name in `latest-linux.yml`. If it does not,
the download is corrupt or was replaced in transit — delete it and download again. A mismatch that
survives a second download is worth reporting.

This catches a broken download. It cannot catch a poisoned release, because the same page carries
both halves.

## 2. Did it come from the project?

That is what the signature is for. Each release also publishes `latest-linux.yml.sig`: a signature
over the exact bytes of the manifest, made with the project's update key. The public half is pinned
inside the desktop app, so an app only trusts a feed signed by that key.

You do not have to check this by hand — the apps do it every time they read a feed, and Suite Start
does it before it installs anything. It is listed here so the mechanism is not invisible: if the
signature does not verify, nothing is installed, and that is the intended outcome rather than a bug.

## 3. Is this the version you meant?

`latest-linux.yml` names one version, and `releases/latest/download/...` is a stable redirect to
whatever is newest. If you need a specific version — to pin one, or to go back after a bad
update — take the file from that version's own release page instead of `latest`.

Suite Start itself can go back one version without downloading anything: a card offers the version
the last update replaced.

## Suite Start's own hash

The hub cannot verify itself. It has no feed it trusts on a first install, so on the very first
download the checksum on the release page is the only check there is. After that, Start's app rows
update through the same signed feed as everything else.
