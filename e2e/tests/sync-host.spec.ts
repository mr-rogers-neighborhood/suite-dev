import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  addDevice,
  createDeviceIdentity,
  createWorkspaceGroup,
  encodeBase64,
  encodeRelayMessage,
  framePayload,
  joinWorkspaceGroup,
  open,
  RELAY_PROTOCOL_VERSION,
  type RelayHostMessage,
  roleRecordPayload,
  type SealedFrame,
  seal,
} from "@suite/sync";
import { findFreePort } from "../../scripts/lib/ports.mjs";
import { launchStart } from "../fixtures/suite";

/**
 * The shipped hub as the host, and two devices that are not it.
 *
 * This is M4's definition of done: the relay under test is the one in the staged
 * binary, and the documents that meet through it are sealed by processes the hub has
 * never heard of. If Start held a document, or could read one, this test would not care —
 * which is the point of checking the store afterwards.
 */

const workspaceId = "ab".repeat(32);

function device(name: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);
  const publicKeyBase64 = raw.toString("base64");
  return {
    deviceId: createHashHex(raw),
    publicKey: publicKeyBase64,
    name,
    sign: (payload: Uint8Array | string) =>
      sign(null, Buffer.from(payload), privateKey).toString("base64"),
  };
}

/** The protocol defines a device id as the SHA-256 of its public key. */
function createHashHex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class Client {
  readonly messages: RelayHostMessage[] = [];
  private waiters: Array<() => void> = [];

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      this.messages.push(JSON.parse(String(event.data)) as RelayHostMessage);
      for (const waiter of this.waiters) waiter();
      this.waiters = [];
    });
  }

  static async connect(url: string): Promise<Client> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("socket error")), { once: true });
    });
    return new Client(socket);
  }

  send(message: unknown): void {
    this.socket.send(encodeRelayMessage(message as Parameters<typeof encodeRelayMessage>[0]));
  }

  async until(predicate: (message: RelayHostMessage) => boolean, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(predicate);
      if (found !== undefined) return found;
      if (Date.now() > deadline) throw new Error(`timed out; saw ${JSON.stringify(this.messages)}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 25);
      });
    }
  }

  close(): void {
    this.socket.close();
  }
}

test("a device outside the hub converges through the hub's own relay", async () => {
  const root = await mkdtemp(join(tmpdir(), "suite-start-sync-"));
  const port = await findFreePort(18_900);
  const start = await launchStart({
    root,
    env: { SUITE_START_SYNC_PORT: String(port) },
  });

  try {
    // The pane is where a person learns the address, so the test reads it there
    // rather than asking the process for something the window cannot see.
    await start.page.getByRole("tab", { name: "Sync" }).click();
    const address = start.page.locator("#sync-address");
    await expect(address).toContainText("ws://127.0.0.1:", { timeout: 30_000 });
    const url = (await address.textContent())?.trim() ?? "";

    const owner = device("owner-laptop");
    const second = device("owner-desktop");

    const alice = await Client.connect(url);
    const bob = await Client.connect(url);

    alice.send({
      type: "join",
      protocolVersion: RELAY_PROTOCOL_VERSION,
      workspaceId,
      deviceId: owner.deviceId,
      publicKey: owner.publicKey,
      name: "owner-laptop",
    });
    await alice.until((m) => m.type === "joined");

    const ownerRole = {
      workspaceId,
      deviceId: owner.deviceId,
      role: "owner" as const,
      seq: 0,
      signerId: owner.deviceId,
    };
    alice.send({
      type: "role",
      record: { ...ownerRole, signature: owner.sign(roleRecordPayload(ownerRole)) },
    });
    await alice.until((m) => m.type === "applied");

    bob.send({
      type: "join",
      protocolVersion: RELAY_PROTOCOL_VERSION,
      workspaceId,
      deviceId: second.deviceId,
      publicKey: second.publicKey,
      name: "owner-desktop",
    });
    await bob.until((m) => m.type === "joined");

    const editorRole = {
      workspaceId,
      deviceId: second.deviceId,
      role: "editor" as const,
      seq: 0,
      signerId: owner.deviceId,
    };
    alice.send({
      type: "role",
      record: { ...editorRole, signature: owner.sign(roleRecordPayload(editorRole)) },
    });
    await alice.until((m) => m.type === "applied" && m.deviceId === second.deviceId);

    // Two devices, one group, and a document that only they can read.
    const ownerIdentity = await createDeviceIdentity("owner-laptop");
    const secondIdentity = await createDeviceIdentity("owner-desktop");
    const group = await createWorkspaceGroup(workspaceId, ownerIdentity);
    const added = await addDevice(group, secondIdentity.keyPackage);
    const joinedGroup = await joinWorkspaceGroup(added.welcome, secondIdentity);

    const plaintext = '{"title":"Through the hub"}';
    const sealed = await seal(added.group, new TextEncoder().encode(plaintext));
    const header = {
      kind: "application" as const,
      workspaceId,
      deviceId: owner.deviceId,
      epoch: sealed.group.epoch,
      payload: encodeBase64(sealed.message),
    };
    const frame: SealedFrame = { ...header, signature: owner.sign(framePayload(header)) };
    alice.send({ type: "frame", frame });

    const delivered = await bob.until((m) => m.type === "frame");
    if (delivered.type !== "frame") throw new Error("expected a frame");
    const opened = await open(joinedGroup, Buffer.from(delivered.frame.payload, "base64"));
    expect(new TextDecoder().decode(opened.plaintext ?? new Uint8Array())).toBe(plaintext);

    // The hub drew what it holds: one workspace, one change through it, two devices with roles.
    // It says "change" rather than "frame" — the pane speaks to a person, not to the protocol.
    await start.page.getByRole("tab", { name: "Sync" }).click();
    await expect(start.page.locator(".sync-workspaces > li")).toHaveCount(1, { timeout: 15_000 });
    await expect(start.page.locator(".sync-workspaces")).toContainText("1 change passed through");
    await expect(start.page.locator(".sync-members > li")).toHaveCount(2);

    alice.close();
    bob.close();
  } finally {
    await start.close();
  }
});
