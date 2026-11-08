# Comparable systems

Tracks B and C: what other systems solved, and **what each assumes that we do not have**. Marks per
[README.md](README.md).

The organising question is not "what do they do" but "which of our problems is already solved, and what
would adopting the solution cost". A precedent we cannot afford is still worth recording, because knowing
why we did not use it is what stops the next person rediscovering it.

## The map, before the detail

| Problem we have                                   | Solved by                                                     | Their assumption we lack                           |
| ------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Declaring what a pack may touch                   | Chrome permissions, Tauri capabilities, W3C `req_permissions` | None — all three are adoptable                     |
| Enforcing it against a hostile pack               | Figma's two-realm split                                       | A second realm with _no_ browser APIs              |
| Lazy loading a pack's code                        | VS Code activation events                                     | A manifest listing contributions                   |
| Three execution tiers by capability               | VS Code's local / web / remote hosts                          | Extensions that work in more than one              |
| Shipping a local-first app with a user-run server | **Actual Budget**                                             | Nothing — this is our exact model, already shipped |
| Sync engine as a library                          | Electric, PowerSync, Zero                                     | Postgres, a server, and writes through an API      |
| CRDT sync                                         | Loro (ours)                                                   | Nothing — we are using it, but not all of it       |

## B1. W3C MiniApps

**Documented.** The [white paper](https://www.w3.org/TR/mini-app-white-paper/) is a Group Note; the Working
Group is chartered to April 2026. Published specs it references: **Lifecycle**, **Manifest**, **Packaging**,
**Addressing**, and **Widget requirements** — the last explicitly incomplete.

The **Manifest** spec is the one to read first: it standardises `app_id`, `version`, `platform_version`,
`device_type`, `pages`, `req_permissions`, `widgets`, `color_scheme`, `window`.

**Addressing** is the sleeper. It defines a URI scheme for a MiniApp with a _prefix_, a `miniapp`
_infix_, and an **identifier plus version**, explicitly to fix the problem that _"each MiniApp vendor has
its own way of describing a MiniApp resource"_. We have `suite://` deep links; they have a spec for the
same idea.

**What to take:** read Manifest and Packaging before touching our pack format again. Adopt their field
names where they are better (`req_permissions`, `platform_version`) or record why ours differ.

**What not to take:** the addressing scheme _as a requirement_. We have a working `suite://` parser with
paranoid validation; adopting a second scheme to match a spec we do not implement buys nothing.

## B2. Figma plugins

**Documented.** The closest structural precedent to the problem
[ADR-0002](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/adr/0002-isolation-is-a-document-boundary.md) says we have not solved.

Figma splits a plugin into two realms:

| Realm                            | Has                                  | Lacks                                            |
| -------------------------------- | ------------------------------------ | ------------------------------------------------ |
| **Plugin sandbox** (main thread) | The Figma scene — the document       | `fetch`, `XMLHttpRequest`, `setTimeout`, the DOM |
| **UI iframe** (`figma.showUI()`) | Full browser APIs, HTML, any library | The Figma scene                                  |

They communicate by message passing. In Figma's words: _"The main thread can access the Figma 'scene' but
not the browser APIs. Conversely, the iframe can access the browser APIs, but not the Figma scene."_

**This is the inverse of ours.** Our pack's iframe has browser APIs _and_ mediated document access, which
is exactly why ADR-0001 has to label `network` **advisory** — we cannot stop a pack from calling `fetch`
in the same realm where it draws.

**What to take:** the split itself. A logic realm with document access and no network, plus a view realm
with network and no documents, makes the `network` capability enforceable without an origin boundary. It
also happens to match the W3C model, which puts _state_ in a worker and leaves rendering stateless.

**What it costs:** every pack becomes two bundles and a message protocol, and a pack author has to learn
which side of the line their code belongs on. That is a real tax on a three-pack ecosystem, and it is the
reason this is a finding rather than a recommendation.

## B3. VS Code extensions

**Documented.** Two mechanisms worth having.

**The extension host is a separate runtime, and there are three of them:** `local` (Node.js, same machine
as the UI), `web` (a **Browser WebWorker**), and `remote` (Node.js, in a container or over SSH). An
extension declares where it wants to run via `extensionKind` — `"workspace"` or `"ui"` — and VS Code
chooses a host based on that, on what the extension can run in, and on where it is installed.

**What to take, first:** the _web_ extension host is proof that a meaningful extension can run in a
browser Worker. That is the target for a two-realm split on our side — no native code, no second WebView.

**What to take, second:** `extensionKind` is a _declaration of execution environment_ in a manifest. We
have `isolation` as a host-only concern; making a pack declare what it needs to run is a cleaner version
of the same idea.

**What not to take:** three hosts. We have one, and the cost of a second is the whole reason this report
exists.

## B4. Chrome extensions

**Documented.** The canonical capability manifest, and the oldest.

- `permissions` — a list of known strings, checked against a fixed vocabulary.
- `optional_permissions` — _"granted by the user at runtime, instead of at install time"_.
- `host_permissions` / `optional_host_permissions` — the same split, for hosts.
- Changing a permission can trigger a **user-visible warning**.

Chrome's own stated purpose: _"Permissions help to limit damage if your extension is compromised by
malware."_ Note the framing — limiting damage, not preventing access.

**What to take:** the two-tier split between declared and _optionally_ declared. [ADR-0001](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/adr/0001-packs-declare-capabilities.md)
has one tier; a pack that wants `files` only when exporting should be able to ask later rather than up
front, and a person should be able to say no and still use the pack.

**What not to take:** warning fatigue. **Documented** that Chrome shows user-visible warnings for some
permissions; **Unverified** that people read them — the claim that permission prompts are ineffective is
widely repeated and this pass found no study for it. The caution stands either way: a prompt nobody reads
is not consent, and we should not build a model whose safety depends on one being read.

## B5. Tauri

**Documented.** The closest _competitor_ to our host, because it is also a WebView host with a capability
system — and it shipped one.

- **Capabilities** "granularly enable and constrain the core exposure to the application frontend running
  in the system WebView".
- Capabilities define **which permissions are granted or denied for which windows or webviews**.
- Defined as JSON or TOML files in `src-tauri/capabilities`; all files in that directory are enabled by
  default, and an explicit list in `tauri.conf.json` narrows that.
- **Per-platform**: a `platforms` array scopes a capability to `linux`, `macOS`, `windows`, `iOS`, `android`.
- App-defined commands are **allowed by default** unless constrained through `AppManifest::commands`.

**What to take:** the shape — capability _per webview_, permission _per capability_, files on disk rather
than a database in code. Our model is capability-per-pack with a hardcoded vocabulary in `pack.ts`; Tauri's
is more inspectable and diffable.

**What to take, second:** the per-platform scoping. A phone pack and a desktop pack may legitimately need
different permissions, and we have no concept of that.

**The criticism worth recording:** "app-defined commands are allowed by default" is the same mistake
ADR-0001 exists to avoid. Tauri's _core_ is secure by default; its _app_ surface is not.

## B6. Electron

**Not independently verified in this pass.** Our desktop apps run Electron and use `contextIsolation` with
a preload bridge, which is visible in our own source (**Code**). The specific behaviours of
`utilityProcess` and `sandbox: true` are **Unverified** here and worth reading before the desktop adopts
anything from this report.

Recorded so it is not mistaken for research: the desktop isolation story was not examined, and any claim
about it in a future plan should start by reading Electron's own docs.

## B7. Android

Not a research pass — a mix of things read and one thing actually tried. The distinction is the point:

- **Documented, not measured.** `activity-alias` gives one APK several launcher entries with their own name
  and icon, toggled with `PackageManager.setComponentEnabledSetting(..., DONT_KILL_APP)`. We have not
  exercised it on a device. _(An earlier draft of this section marked it Measured. It was not, and the
  correction is left visible because that is the failure mode this whole directory exists to prevent.)_
- **Documented, not measured.** `WorkManager` and foreground services are the sanctioned background
  mechanisms — which is the reason
  [ADR-0006](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/adr/0006-the-doorbell-is-reserved.md)
  reserves the doorbell rather than building one.
- **Measured.** SAF is reachable through a WebView `<input type="file">`. Tapping the shell's "Install an
  app…" button raised `com.android.documentsui/.picker.PickActivity` — the real system picker, from a real
  tap, with no third-party plugin. **And a programmatic `.click()` on the same input does not raise it**:
  the picker requires a trusted user gesture. Any pack that awaits something before calling
  `files.pickOpen()` will find that the picker silently never opens, which is a bug class worth writing down
  rather than discovering.

**Unverified:** whether Android's own permission model has anything to teach a pack capability model. It
probably does — runtime permission grants, revocation, and the fact that revocation is visible to the user
— but this pass did not read it.

## B8. Obsidian plugins

**Not verified.** Obsidian's plugin model is widely understood to run unsandboxed with broad filesystem
and network access, which would make it the cautionary case: an ecosystem that works because the author
trusts every plugin. **Unverified** — and important enough that a future pass should confirm it rather than
repeat it, particularly because the first real user's existing setup depends on Obsidian.

## C1. Sync engines: what each assumes

The valuable question is not "which engine" but "which assumption rules it out".

| Engine                         | Verified assumption                                                                                                                                                        | Verdict for us                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Electric**                   | _"a read-path sync engine for Postgres. It syncs data out of Postgres into local clients over HTTP using a primitive called a Shape"_; writes go _"back through your API"_ | **Ruled out.** Requires Postgres, a server, and a write API                    |
| PowerSync, Zero, Jazz, Triplit | **Unverified** in this pass                                                                                                                                                | Must be checked the same way: _what does it assume?_ before _what does it do?_ |
| **Loro** (ours)                | Two peers converge in **two message exchanges** using version vectors; realtime is "subscribe to local updates and broadcast"                                              | We are already on the right layer                                              |

**The finding is the shape of the question.** Every "local-first sync engine" surveyed in any depth turns
out to be a _server-and-database_ product with a local cache. That is not a criticism — it is the honest
description of what the category mostly is. It means "use a sync engine" and "operate no server" are in
direct tension, and no engine surveyed resolves it.

## C2. What Loro offers that we are not using

**Documented.** From Loro's own documentation, and the source of two real warnings:

- **Two-message sync.** Version vectors first, then each side sends what the other lacks. We currently ship
  whole snapshots.
- **Realtime without version comparison.** After the first sync, subscribe to local updates and broadcast.
  We do not use subscriptions for sync, only for saving.
- **Shallow export.** A snapshot _without_ the complete history — for sharing a document without handing
  over its evolution, and for faster imports.
- **Redaction.** Removing specific segments of history while keeping the document functional.
- **`import` returns pending state.** And a warning worth quoting because it is a trap we would fall into:
  > an empty pending map means that queue is empty, not that the document is synced.

- **A modelling hazard we already have.** _"If two offline peers create regular child containers under the
  same Map key, sync will converge to one visible Map value and the other child can be hidden by the Map
  conflict rule."_ Two devices creating the same field while offline silently lose one. Loro provides lazy
  child containers for the dynamic case; our documents should be checked against this before anyone
  collaborates on one.

## C3. Pairing and identity without a server

**Unverified** in this pass. The candidates are Syncthing's device IDs and QR pairing, Tailscale's
coordination server, and Actual's server-based login. Recorded as a research gap rather than a conclusion,
because this is the gap between "one device" and "same person, multiple devices" and we have no design.

## C4. Blind relays

**Unverified** in this pass. The candidates worth reading are Nostr (relays that forward signed events they
cannot read usefully), SimpleX (no identifiers at all), and Briar (no server). Each makes a different
trade-off between metadata and usability, and our
[blind-doorbell proposal](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/reference/blind-doorbell-proposal.md) depends on getting this
right.

## C5. Actual Budget: the precedent that matches us

**Documented.** This is the closest shipped analogue to our whole model, and it was not in the original
list.

> It stores all of your data on your installed Actual server by default AND it stores all of your data on
> your local device. That means it works regardless of your network connection […] Your data never goes to
> any external servers that you don't choose.

And, crucially:

> For the super privacy-focused, it even allows for your data to be **end-to-end encrypted** so that all
> your server is doing is passing around changes that you make to your budget.

**Two findings in that.**

1. **The model is proven to ship.** Local-first, user-run server, blind-with-E2E. That is what we are
   building, and someone has already shipped it to real users.
2. **They made E2E encryption optional, not default.** Their documentation states the reason plainly: with
   E2E on, _"you will not be able to recover your data if you forget your encryption password."_ We made
   blindness the only option, via MLS in the sync protocol. That is a defensible difference and it is a
   _decision_ we have made that Actual declined to make — worth knowing we are the stricter one, and worth
   knowing what it costs a person who forgets.

## C6. The local-first literature

**Documented.** Ink & Switch's essay states the tension in its opening: _"the cloud gives us collaboration,
but old-fashioned apps give us ownership"_, and asks for both. Everything in our architecture is an answer
to that sentence.

The essay's seven ideals are the standard checklist. This pass did not verify our position against each
one — that is a follow-up worth doing, because the risk is not failing an ideal but _quietly dropping one_.
Candidate: does our model meet "no spinners: your work at your fingertips"? A pack that must download before
first open does not.

## What this track changes

Three things, in order of how much they would cost to learn later:

1. **`req_permissions` exists.** Our capability field is a reinvented standard field.
2. **Figma's split makes `network` enforceability a solved problem**, in web code, without an origin
   boundary.
3. **Actual shipped our model**, with E2E optional rather than required.

None of these is a defect in what was built. All three are the case for reading before designing, which is
why the framing was worth testing.
