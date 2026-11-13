import { Context } from "../src/context.js";
import { configuration } from "../src/config.js";
import { recoverAccount } from "../src/recovery.js";
function argument(name: string) {
  const value = process.argv
    .find((a) => a.startsWith("--" + name + "="))
    ?.slice(name.length + 3);
  if (!value || !/^[A-Za-z0-9_-]{8,100}$/.test(value))
    throw new Error("Provide --" + name + "=ID.");
  return value;
}
const request = argument("request"),
  target = argument("target"),
  operator = argument("operator");
const context = new Context(configuration());
try {
  console.info(
    JSON.stringify(
      await recoverAccount(
        context,
        request,
        target,
        operator,
        process.argv.includes("--execute"),
      ),
    ),
  );
} finally {
  await context.pool.end();
}
