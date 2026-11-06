import { createHash, randomBytes } from "node:crypto";

/** A 32-byte id, the shape the sync protocol uses for workspaces and members. */
export function hexId() {
  return randomBytes(32).toString("hex");
}

export function isHexId(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

/**
 * The sync room for a Canvas workspace id.
 *
 * A Canvas id is a document id, not a fingerprint, so a non-hex one is hashed.
 * This is the same rule `suite-sync workspace init --from-canvas` applies; it
 * lives here too so the harness can predict the room without running the CLI.
 */
export function syncIdFor(appWorkspaceId) {
  if (isHexId(appWorkspaceId)) return appWorkspaceId;
  return createHash("sha256").update(appWorkspaceId).digest("hex");
}
