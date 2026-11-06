import { stopStale } from "../../scripts/lib/proc.mjs";

/**
 * A failed run can leave a detached server behind; the next one then fights it
 * for a port. This runs before the first test so the suite starts from a clean
 * process table.
 */
export default function globalSetup(): void {
  const stopped = stopStale();
  if (stopped.length > 0) console.log(`stopped ${stopped.length} stale service(s)`);
}
