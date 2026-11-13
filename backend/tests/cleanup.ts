import { rm } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
export async function removeTestDirectory(target: string, root: string) {
  const absolute = resolve(target),
    allowed = resolve(root),
    within = relative(allowed, absolute);
  if (!within || within.startsWith("..") || isAbsolute(within))
    throw new Error("Refusing cleanup outside the isolated test directory.");
  await rm(absolute, { recursive: true, force: true });
}
