import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fingerprintOf, signManifest } from "./sign-release.mjs";

const pair = generateKeyPairSync("ed25519");
const privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("signManifest", () => {
  it("produces a signature the pinned key can check", () => {
    const bytes = Buffer.from("version: 0.1.0\n");
    const signature = Buffer.from(signManifest(bytes, privatePem), "base64");
    expect(verify(null, bytes, pair.publicKey, signature)).toBe(true);
  });

  it("covers the bytes as they are, so one changed character fails", () => {
    const bytes = Buffer.from("version: 0.1.0\n");
    const signature = Buffer.from(signManifest(bytes, privatePem), "base64");
    const tampered = Buffer.from("version: 9.9.9\n");
    expect(verify(null, tampered, pair.publicKey, signature)).toBe(false);
  });
});

describe("fingerprintOf", () => {
  it("is a short, stable digest of the public half", () => {
    const first = fingerprintOf(privatePem);
    expect(first).toMatch(/^[0-9a-f]{32}$/u);
    expect(fingerprintOf(privatePem)).toBe(first);
  });
});
