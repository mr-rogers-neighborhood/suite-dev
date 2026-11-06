import { createServer } from "node:net";

export async function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

/**
 * The first free port at or above `from`.
 *
 * A fixed port is the most common reason a second run fails, so every run
 * discovers its own and records it in `.dev/env.json`. A caller that needs the
 * number afterwards reads that file rather than guessing.
 */
export async function findFreePort(from, host = "127.0.0.1", tries = 50) {
  for (let port = from; port < from + tries; port += 1) {
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(`no free port between ${from} and ${from + tries - 1}`);
}

export async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}
