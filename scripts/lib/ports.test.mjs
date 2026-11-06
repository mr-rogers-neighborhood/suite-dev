import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { findFreePort, isPortFree } from "./ports.mjs";

function hold(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

describe("ports", () => {
  it("finds a free port at or above the starting point", async () => {
    const port = await findFreePort(8900);
    expect(port).toBeGreaterThanOrEqual(8900);
    expect(await isPortFree(port)).toBe(true);
  });

  it("skips a port that is in use", async () => {
    const start = await findFreePort(8950);
    const server = await hold(start);
    try {
      const next = await findFreePort(start);
      expect(next).toBeGreaterThan(start);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
