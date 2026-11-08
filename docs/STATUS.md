# Status

What works, per subsystem. "Working" means a test fails if it breaks.

Last reviewed 2026-11-07, at Suite Start 0.3.5.

| Subsystem                 | State     | Notes                                                                  |
| ------------------------- | --------- | ---------------------------------------------------------------------- |
| Install                   | Working   | Signed feed, fingerprint check, binary placed, menu entry written.     |
| Update                    | Working   | A card offers the feed's version; pressing it replaces and relaunches. |
| Rollback                  | Working   | One step back, from disk, no download.                                 |
| Uninstall                 | Working   | Versions, entry, icon and record removed. Documents are not touched.   |
| Icons                     | Working   | Each app's own artwork, at 256 px, in the hicolor theme.               |
| Routing                   | Working   | `suite://` links and document files open the owning app.               |
| Document index            | Working   | Lists documents without importing any app's code.                      |
| Sync: protocol, transport | Working   | Encrypted frames through a blind relay.                                |
| Sync: invite and join     | Missing   | Adding a device is a CLI step.                                         |
| Sync: headless relay      | Missing   | The relay runs inside Start. A standalone binary is next.              |
| Sync in the apps          | Partial   | Canvas syncs. Planner and Budget do not yet.                           |
| App features              | Alpha     | Canvas is furthest along. Each app's README says what it has.          |
| macOS and Windows         | Not built | No signing identity, so nothing is published.                          |
| Standalone app installs   | Not built | Apps currently arrive through Start.                                   |

Missing and Not built are listed so their absence is not a surprise rather than a discovery.

## Where things are

Suite Start's Settings pane lists the binary, documents folder and data directory for each app.
Those are the same paths the apps resolve, so the list cannot drift.
