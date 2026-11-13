// Explicit test-only disk adapter. Production uploads never fall back to disk.
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { FileStorage } from "../src/storage.js";

export function localTestStorage(directory: string): FileStorage {
  return {
    async upload(file) {
      if (!/^[a-f0-9-]+(?:\.thumb)?\.webp$/.test(file.key))
        throw new Error("Invalid test filename");
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, file.key), file.body);
      return { provider: "local", key: file.key };
    },
    async remove(file) {
      await unlink(resolve(directory, file.key));
    },
    async deliveryUrl() {
      return null;
    },
  };
}
