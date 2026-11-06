import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sibling } from "./paths.mjs";

const FALLBACK_SCHEMA_VERSION = 6;

/**
 * The schema version Canvas writes into its envelope.
 *
 * Read from the source rather than pinned here: the harness must not become the
 * second place that has to be bumped when the document schema changes. The
 * fallback only exists so a renamed constant fails loudly in a test, not in a
 * demo.
 */
export async function canvasSchemaVersion() {
  const path = join(sibling("suite-canvas"), "packages/graph/src/loro/constants.ts");
  try {
    const text = await readFile(path, "utf8");
    const match = /export const SCHEMA_VERSION\s*=\s*(\d+)/u.exec(text);
    if (match === null) return FALLBACK_SCHEMA_VERSION;
    return Number(match[1]);
  } catch {
    return FALLBACK_SCHEMA_VERSION;
  }
}

/**
 * An empty document, as the bytes Canvas would write.
 *
 * A real snapshot rather than zero bytes: the app imports what it is given, and an empty
 * envelope is not a document any of the app's own code paths produce.
 */
export async function emptySnapshot() {
  const { LoroDoc } = await import("loro-crdt");
  return new LoroDoc().export({ mode: "snapshot" });
}

/**
 * A `.canvas` envelope around an existing Loro snapshot.
 *
 * The harness does not need the graph schema to write a file the app can open:
 * the envelope is the shape `workspaceFileSchema` accepts, and the app seeds an
 * empty document on first open. Writing the file from the sync server's own
 * empty snapshot keeps the two halves on the same document from the start.
 */
export async function writeCanvasFile({ path, workspaceId, snapshot, schemaVersion }) {
  const envelope = {
    kind: "suite.canvas",
    version: 3,
    schemaVersion,
    exportedAt: new Date().toISOString(),
    workspaceId,
    document: Buffer.from(snapshot).toString("base64"),
    manifest: { boards: 0, cards: 0, types: 0, tags: 0 },
    attachments: {},
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`);
  return path;
}
