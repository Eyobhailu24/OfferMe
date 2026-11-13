import { z } from "zod";
import { Context } from "../src/context.js";
import { configuration } from "../src/config.js";
import { eraseAccount } from "../src/privacy.js";
const requestId = z
  .string()
  .uuid()
  .parse(process.argv.find((a) => a.startsWith("--request="))?.slice(10));
const context = new Context(configuration());
try {
  console.info(
    JSON.stringify(
      await eraseAccount(
        context,
        requestId,
        process.argv.includes("--execute"),
      ),
    ),
  );
} finally {
  await context.pool.end();
}
