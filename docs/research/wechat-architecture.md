# WeChat architecture, and what it actually is

Track A. What the host does, mechanism by mechanism, and what problem each solves. Marks per
[README.md](README.md): **Documented**, **Code**, **Measured**, **Unverified**.

Read alongside [comparable-systems.md](comparable-systems.md), because the most useful thing in this track
is how closely the [W3C MiniApp specification](https://www.w3.org/TR/mini-app-white-paper/) describes the
same mechanisms — and where it describes them _better_.

## The finding that reframes this track

**Documented.** The MiniApp model is standardised, and the specification describes the architecture
explicitly rather than leaving it to be inferred. The white paper states the model in one sentence:

> In a MiniApp, the view layer is separated from the logic layer. […] The logic layer is implemented with
> JavaScript Workers. The logic layer is responsible for MiniApp's event processing, API calls, and
> lifecycle management.

And then the part that matters most:

> **The rendering can be considered stateless, and all the states will be stored in the worker.**

That is not a description of WeChat specifically; it is a description of the _model_, written by people
who had to make it portable across vendors. It is the single most useful sentence found in this research
pass, because it inverts what a naive web app does: the document of record lives in a worker with no DOM,
and each view is a stateless projection fed by messages.

Our pack today is one iframe holding logic _and_ UI, with the document on the _host_ side of a bridge.
That is a third arrangement, and the report says so rather than assuming ours matches theirs.

## 1. The two-layer split

|                        | WeChat                                               | W3C description                                    |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Logic layer runtime    | V8 on Android, JavaScriptCore on iOS                 | JavaScript Worker                                  |
| View layer runtime     | XWeb (Chromium-derived) on Android, WKWebView on iOS | WebView, or native components ("hybrid rendering") |
| Logic layer DOM access | **None** — `jQuery` and `Zepto` cannot run           | Not stated, but a Worker implies none              |
| State lives in         | The logic layer                                      | The worker, explicitly                             |
| Rendering              | Per-page view threads                                | "Each Render"; rendering considered stateless      |

**Documented** (WeChat runtime environment page; W3C white paper §2.1.1). **Code** indirectly: the
consequence — that a browser-oriented library cannot run in the logic layer — is stated by WeChat's own
documentation as a limitation of the model, not a bug.

**Why the split exists**, in the white paper's own words: _"Separation and parallel implementation of
render and JavaScript worker can prevent the situation where a JavaScript execution impacts or slows down
the page rendering."_ Note what that claim is and is not. It is a claim about **not blocking paint**. It
is not a claim about isolation, crash containment, or memory — the same process hosts both.

This matters for us because we have treated "isolation" as one thing. WeChat's split is a _scheduling_
separation. Ours ([ADR-0002](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/adr/0002-isolation-is-a-document-boundary.md)) is a
_document_ separation. Figma's is a _capability_ separation. Three different axes, often conflated.

## 2. Packaging

**Documented.** A MiniApp package is a compressed ZIP archive containing a configuration document at the
package root plus pages, components, stylesheets, scripts and media. The manifest extends the Web App
Manifest with nine supplementary members: `app_id`, `version`, `platform_version`, `device_type`,
`pages`, `req_permissions`, `widgets`, `color_scheme`, `window`.

**This is nearly isomorphic to our pack manifest**, and we built ours without reading it:

| Ours (suite-go)                          | W3C MiniApp manifest                               | Same job?                                  |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `id`                                     | `app_id`                                           | Yes                                        |
| `version`                                | `version`                                          | Yes                                        |
| `entry`                                  | `pages` (plural)                                   | Ours is one entry; theirs is a route table |
| `capabilities`                           | **`req_permissions`**                              | **Yes — this is the finding**              |
| `contractVersion` / `minimumHostVersion` | `platform_version`                                 | Yes, near enough                           |
| `isolation`                              | —                                                  | Ours only                                  |
| —                                        | `device_type`, `widgets`, `color_scheme`, `window` | Gaps on our side                           |
| ZIP container                            | ZIP container                                      | Yes                                        |

**The `req_permissions` overlap is the concrete case for reading specs first.** We designed a capability
list, wrote an ADR about it, and implemented enforcement — and a standard field with the same purpose has
existed throughout. That does not make our design wrong; it makes it _unreviewed against prior art_.

### Subpackages

**Documented** (WeChat framework docs). A mini program declares subpackages with their own root
directories.

- A subpackage **cannot** `require` another subpackage's JS, templates or assets. It may use the main
  package and its own files. The restriction is stated as a packaging rule, not advice.
- **Independent subpackages** (`independent: true`) run _without the main package being downloaded_; the
  main package downloads only when a non-independent page is visited.
- **Preload** (`preloadRule`) prefetches packages on entering a page, with `network: wifi | all` and a
  **2 MB budget per page group**, enforced at build time.
- **Async cross-package references** (`require.async`, placeholder components) let one package wait for
  another's download instead of failing.

**Limits on total package size: Unverified.** Two attempts to find them in the framework documentation
returned 404. They appear to live in the admin console or release notes. Any figure circulating is one we
could not confirm, and the report refuses to repeat one.

**What a pack author would learn from this:** the prohibition on cross-package imports is the load-bearing
rule, not the size limit. It is what keeps a subpackage independently downloadable. We have no such rule;
our packer would happily let two packs import each other.

## 3. Lifecycle

**Documented** (WeChat operating-mechanism page):

| State         | Trigger                                | Consequence                                                    |
| ------------- | -------------------------------------- | -------------------------------------------------------------- |
| Foreground    | Opened or returned to                  | Full operation                                                 |
| Background    | Left via back, home, or leaving WeChat | Runs briefly; some APIs restricted                             |
| **Suspended** | ~**5 seconds** in background           | JS thread stops; **memory is retained**; events fire on return |
| **Destroyed** | ~**30 minutes** suspended              | Terminated outright                                            |

Under memory pressure the client destroys a mini program proactively and tells the user ("running out of
memory, please reopen"). WeChat's own advice is to listen for `wx.onMemoryWarning` and clean up.

**Why these numbers are interesting to us:** [ADR-0005](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/adr/0005-durability-boundaries.md)
chose five minutes for releasing a backgrounded module, by judgement. WeChat chose 30 minutes for
_destruction_ and 5 seconds for _suspension_. Both longer-lived than our choice for suspension and longer
for destruction — which suggests our five minutes is defensible, but it was a guess and remains one.

The important structural lesson is not the number. It is that **suspend and destroy are separate states**.
Our shell conflates them: leaving a module disposes it, so there is no "still mounted, not running" state.

## 4. Updates

**Documented** (WeChat update-mechanism page):

- Every cold start **asynchronously** checks for an update and downloads it in the background.
- The new version is used **on the next cold start**, not immediately.
- A **synchronous** path exists for periodic checks and long-unused programs, which blocks launch — but on
  failure **falls back to the locally installed older version**.
- Admins can set a "prefer local version" floor and a **"minimum usable version"** below which the program
  will not open and the client keeps trying to download.
- Full rollout takes about 24 hours to reach 99% of users.

**What we should steal:** the _minimum usable version_ concept, and the fallback-to-local rule. Both are
cheap, and both are exactly the failure modes we have not designed for. Our packs have no update story at
all.

**What we should not:** the 24-hour rollout. We have no review queue and no hosting.

## 5. Capabilities

**Documented**, and this is the most directly useful section for
[ADR-0001](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/adr/0001-packs-declare-capabilities.md).
It describes a **three-tier model**, not the two we built.

### Tier 1 — declared, and reviewed by the platform

> For capabilities with high privacy risks, MiniApp requires developers to apply for permission to use such
> features on the MiniApp developer platform. The application includes the rationale, a detailed description
> of the usage scenario, and the demo of usage. Then the platform will review applications […] **Only
> approved MiniApps are allowed to invoke such interfaces.**

Their example is obtaining the user's phone number. Note what this tier is: **not a runtime check at all**.
It is a human review that gates a capability out of the ecosystem entirely. We have no equivalent and cannot
have one without a hosted platform — which the product promises never to operate.

### Tier 2 — user authorization, per named scope

> MiniApp classifies these sensible interfaces into several authorization scopes such as _location_, _album_,
> _address_, _camera_, _calendar_ […] a window will be popped up when the MiniApp tries to invoke the camera
> capability but users don't authorize it.

And a detail worth quoting because it argues against over-specifying: _"MiniApps hosted by different super
apps might have some different privacy authorization [scopes] based on the usage characteristics and usage
scenarios of each super app."_ The scope list is deliberately per-host, not universal.

**This is the tier we are missing entirely.** ADR-0001 implements declaration and enforcement, and stops
there: the host refuses, but nobody is ever asked. Chrome's `optional_permissions` is the same tier
(finding F9), and it is the tier that makes a declaration meaningful to a person rather than to a linter.

### Tier 3 — domain allowlisting, enforced at the bridge

The part that answers the question ADR-0001 could not:

> For some container components, like `<web-view>`, that could render online webpages, MiniApp user agents
> may limit the URLs accessed by the component. **Only the domain configured in the MiniApp Management
> Center can be accessed** […] if the component contains an `<iframe>`, the URL opened by the `iframe`
> should also be configured.

> Similarly, the MiniApp framework verifies the legitimacy of the asynchronous request address. For example,
> for URLs launched by request, download, upload, etc., **their domain must belong to the domain configured**
> in the MiniApp Management Center, and their protocols must be **HTTPS**.

**This is the finding that changes our position on `network`.** We recorded it as _advisory_ because a pack
in a full iframe can call `fetch` and the host never sees it. WeChat and the W3C make it enforceable in two
moves that work together:

1. **The logic layer has no `fetch`** (see §1) — so every network call goes through a host API.
2. **That API allowlists domains** against a declaration, and requires HTTPS.

The pack cannot bypass the check because the realm it runs in has no other way out. That is the same shape as
Figma's split, with the addition that the bridge _filters_ rather than merely forwarding.

**What it costs us:** a pack that talks to nothing needs none of this. A pack that syncs needs a declared
domain list, a bridge that enforces it, and a reason it cannot simply call `fetch` — which means the
document-bearing realm must lose browser APIs. That is the two-realm work, and this is the second
independent argument for it.

### Audit review

**Documented:** packages are reviewed before publishing, across _"data collection, data use, data security,
and geographic location"_. Same conclusion as tier 1 — unavailable without operating a platform, and worth
knowing it exists so we do not mistake our capability list for the whole of what WeChat does.

## 6. Add-ons, widgets and multi-entry

**Documented** as specifications or specification-gaps:

- **Add-ons** are a named section in the white paper (2.1.10) with no detail captured here — **Unverified**.
- **Widgets**: _"A MiniApp Widget is a special form of MiniApp Page […] a widget can occupy a certain area
  instead of the entire screen."_ There is a separate **requirements** document, and the detailed
  specification is explicitly not yet written. So widgets are standardised _in intent_, not in detail.
- **Single-instance, multi-entries**: the white paper names this as a core feature (§2.1.6) — one program
  reachable through several entry points. Body not read; **Unverified** on mechanics.

Widgets and multi-entry are precisely the two features we deferred (a home-screen widget, and per-app
launcher entries). Both are standardised enough to read before building.

## What is centralized by nature

The part of WeChat that cannot be copied, and should not be:

| Mechanism                  | Why it is not transferable                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Social graph**           | Collaboration in WeChat is the contact list. Ours has to be the document                                                                                                 |
| **Payments**               | Requires being a payment institution, not a feature                                                                                                                      |
| **Review and market**      | A hosted catalogue with a review queue, staffed by a company                                                                                                             |
| **Identity as a platform** | `openid` matters because everyone already has WeChat. We have no account at all                                                                                          |
| **Always-resident client** | WeChat's background behaviour is a privilege we will never hold. **Unverified** as a policy claim, but structurally certain: they are a messaging default and we are not |

The white paper is honest about the last one: it describes MiniApps as _"a very popular hybrid solution
relying on Web technologies but also integrates with capabilities of the native apps"_ — the **host is the
platform**, and the host's privileges are the substrate. Our host has no such privileges, which is why
[ADR-0006](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/adr/0006-the-doorbell-is-reserved.md) reserves the doorbell instead of
building it.

## What this track could not establish

Recorded rather than hidden:

- Package size limits. Not in the framework docs; **Unverified**.
- ~~The white paper's security section body.~~ **Closed** — §5 above is now read from the paper's own
  security and privacy section (§6.1–6.4), not inferred.
- Whether WeChat's view threads are per-page _processes_ or per-page _WebView instances in one process_.
  The documentation says "WebView threads", which is ambiguous and load-bearing. **Unverified**.
- Any current-generation "Skyline" rendering behaviour beyond the fact that it exists. **Unverified**.

Each of these is a follow-up, and none of them changes the four findings the register records.
