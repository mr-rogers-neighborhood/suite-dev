import { describe, expect, it } from "vitest";
import { hexId, isHexId, syncIdFor } from "./ids.mjs";

describe("ids", () => {
  it("generates a 64-character lower-case hex id", () => {
    const value = hexId();
    expect(value).toHaveLength(64);
    expect(isHexId(value)).toBe(true);
  });

  it("generates a different id every time", () => {
    expect(hexId()).not.toBe(hexId());
  });

  it("refuses a short, upper-case or non-hex value", () => {
    expect(isHexId("abc")).toBe(false);
    expect(isHexId("A".repeat(64))).toBe(false);
    expect(isHexId("g".repeat(64))).toBe(false);
  });

  it("keeps a fingerprint and hashes anything else", () => {
    const fingerprint = "b".repeat(64);
    expect(syncIdFor(fingerprint)).toBe(fingerprint);
    expect(syncIdFor("a-canvas-uuid")).toMatch(/^[a-f0-9]{64}$/u);
    expect(syncIdFor("a-canvas-uuid")).toBe(syncIdFor("a-canvas-uuid"));
  });
});
