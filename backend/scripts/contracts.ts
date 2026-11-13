import openapiTS, { astToString } from "openapi-typescript";
import { mkdir, writeFile } from "node:fs/promises";
import { configuration } from "../src/config.js";
import { createApplication } from "../src/application.js";
const runtime = await createApplication(configuration(), { quiet: true });
try {
  await mkdir("contracts", { recursive: true });
  await writeFile(
    "contracts/openapi.json",
    JSON.stringify(runtime.apiDocument, null, 2),
  );
  const types = astToString(await openapiTS(runtime.apiDocument as never));
  // Generated copies belong to each client; no runtime imports cross project boundaries.
  for (const destination of [
    "../website/src/lib/api-schema.d.ts",
    "../app/api-schema.d.ts",
  ])
    await writeFile(destination, types);
  console.log("Exported OpenAPI and independent client contracts.");
} finally {
  await runtime.close();
}
