#!/usr/bin/env node
import { stopStale } from "./lib/proc.mjs";

const stopped = stopStale();
if (stopped.length === 0) {
  console.log("nothing to stop");
} else {
  console.log(`stopped ${stopped.length} service(s): ${stopped.join(", ")}`);
}
