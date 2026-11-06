#!/usr/bin/env node
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Sign a feed manifest with the publisher key.
 *
 * The artifact's sha512 stops a corrupt download; it does not stop a manifest
 * somebody else wrote, because they write the hash too. So the manifest is signed
 * and the app refuses one that does not verify.
 *
 * The private key is never in this repository. It is read from `SUITE_UPDATE_KEY`
 * or from the default path below, both of which live on the publisher's machine or
 * in CI.
 */
const DEFAULT_KEY = join(homedir(), ".config", "suite", "update-key.pem");

/** Sign these bytes, exactly as served. Returns base64. */
export function signManifest(bytes, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  return sign(null, bytes, key).toString("base64");
}

/** The fingerprint an app shows, so a rotation is visible rather than silent. */
export function fingerprintOf(privateKeyPem) {
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 32);
}

async function main() {
  const target = process.argv[2];
  if (target === undefined) {
    console.error("usage: node scripts/sign-release.mjs <path to latest*.yml>");
    process.exit(1);
  }

  const keyPath = process.env.SUITE_UPDATE_KEY?.trim() || DEFAULT_KEY;
  const privateKeyPem = await readFile(keyPath, "utf8").catch(() => null);
  if (privateKeyPem === null) {
    console.error(`no publisher key at ${keyPath}. Set SUITE_UPDATE_KEY to its path.`);
    process.exit(1);
  }

  // The signed bytes are the file as served, so it is read once and written once.
  const bytes = await readFile(target);
  const signature = signManifest(bytes, privateKeyPem);
  const signaturePath = `${target}.sig`;
  await writeFile(signaturePath, `${signature}\n`);

  console.log(`signed ${target}`);
  console.log(`  signature -> ${signaturePath}`);
  console.log(`  key       -> ${keyPath}`);
  console.log(`  fingerprint ${fingerprintOf(privateKeyPem)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
