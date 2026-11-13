import { configuration } from "./config.js";
import { Context } from "./context.js";
import { startJobs } from "./jobs.js";
const context = new Context(configuration());
const stop = startJobs(context);
// Keep this standalone process alive while the worker's timers are unreferenced.
const alive = setInterval(() => {}, 60000);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await stop();
    clearInterval(alive);
    await context.pool.end();
  });
console.info(
  "OFFERME worker running. Push delivery is enabled only when EXPO_PUSH_ENABLED=true.",
);
