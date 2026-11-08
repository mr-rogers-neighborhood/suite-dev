# Status

What exists, what works, and what is missing — by subsystem rather than by ambition. "Alpha" is not
a single dial: the installer is further along than sync, and saying so is more useful than a
percentage.

Last reviewed: 2026-11-07, at Suite Start 0.3.5.

| Subsystem                   | State         | What that means                                                                                                                                                                                                      |
| --------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Install**                 | Working       | Start downloads an AppImage from a signed feed, verifies its fingerprint, places it under `~/Applications/Suite/<App>/<version>/`, and writes a menu entry. Covered by an end-to-end test that drives a real window. |
| **Update**                  | Working       | A card offers a version it read from the signed feed; pressing it closes the app, replaces the binary and relaunches. One replaced version is kept.                                                                  |
| **Rollback**                | Working       | A card offers the version the last update replaced, and pressing it points the install back at a binary already on disk.                                                                                             |
| **Uninstall**               | Working       | Removes the version directories, the menu entry, the icon and the install record. Documents are never touched — asserted by test.                                                                                    |
| **Menu entries**            | Working       | One entry per app, at user scope, pointing at the versioned binary. Rewritten on every update.                                                                                                                       |
| **Icons**                   | Working       | Each app's own artwork, at 256 px, in the hicolor theme. Cards, windows and menu entries all show the same mark.                                                                                                     |
| **Routing**                 | Working       | `suite://` links and document files open the owning app.                                                                                                                                                             |
| **Document index**          | Working       | Start lists documents from each app's folder without importing any app's code.                                                                                                                                       |
| **Sync: protocol**          | Working       | Wire protocol, Loro adapter, signed membership log, role records.                                                                                                                                                    |
| **Sync: transport**         | Working       | Encrypted frames through a blind relay. The relay stores and forwards; it cannot read.                                                                                                                               |
| **Sync: identity**          | **Missing**   | There is no invite or join flow. A workspace is bootstrapped with a CLI.                                                                                                                                             |
| **Sync: relay for a NAS**   | **Missing**   | The relay runs inside Start, on a desktop. A headless `suite-sync` binary and its systemd unit are designed but not built.                                                                                           |
| **Sync: in the apps**       | Partial       | Canvas syncs. Planner and Budget do not yet.                                                                                                                                                                         |
| **App features**            | Alpha         | Canvas is the most complete. Planner and Budget are early. Each app's README says what it has.                                                                                                                       |
| **Removal of the hub**      | Working       | Start is an AppImage or an Arch package. Removing it leaves installed apps working.                                                                                                                                  |
| **macOS / Windows**         | **Not built** | Configured, but no signing identity, so nothing is published.                                                                                                                                                        |
| **Standalone app installs** | **Not built** | Every app currently arrives through Start. Installing one directly is not yet supported.                                                                                                                             |

## Reading the columns

- **Working** — there is a test that would fail if it broke, and the failure mode is understood.
- **Partial** — the mechanism exists but does not cover everything it should.
- **Missing** — designed, not built. Listed so its absence is a fact rather than a surprise.
- **Not built** — deliberately out of scope for now, with a reason in the [roadmap](ROADMAP.md).

## What "alpha" means here

See [What exits alpha](ALPHA.md) for the definition and the checklist. In one line: the tests pin
down behaviour, not the maintainers' complete understanding of the code, so keep exports and do not
store the only copy of anything.

## Where things are on your machine

Suite Start's Settings pane lists, per app, the binary, the documents folder and the data directory.
That list is generated from the same paths the apps themselves resolve, so it cannot drift.
