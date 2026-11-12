import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
export default async function teardown() {
  const path = resolve("../backend/.local/e2e-fixture.json");
  const data = JSON.parse(await readFile(path, "utf8"));
  if (data.cleanedUp) return;
  const response = await fetch("http://127.0.0.1:4102/shutdown", {
    method: "POST",
    headers: { Authorization: "Bearer " + data.secret },
  });
  if (!response.ok)
    throw new Error("Could not stop the isolated browser-test backend.");
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (JSON.parse(await readFile(path, "utf8")).cleanedUp) return;
  }
  throw new Error("Test database cleanup did not complete.");
}
