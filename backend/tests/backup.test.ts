import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { fixture } from "./fixture.js";
import { backupDatabase, restoreDatabase } from "../src/backup.js";
import { removeTestDirectory } from "./cleanup.js";

test(
  "encrypted database/media snapshot restores into a new isolated database",
  { timeout: 120000 },
  async () =>
    fixture(async ({ runtime, login, listing }) => {
      const seller = await login("+251900000301", "Restore Seller");
      await listing(seller.cookie);
      const root = resolve(".local/test-backups"),
        directory = resolve(root, "offerme_" + process.pid + "_" + Date.now()),
        media = resolve(directory, "restored-media");
      const target = new URL(runtime.context.config.databaseUrl);
      target.pathname =
        "/offerme_restore_test_" + process.pid + "_" + Date.now();
      const key = "01".repeat(32);
      let created = false;
      try {
        const backup = await backupDatabase(
          runtime.context.config.databaseUrl,
          directory,
          runtime.context.config.uploadDir,
          key,
        );
        assert.equal(backup.counts.listing, 1);
        assert.equal(backup.localMedia.length, 2);
        const result = await restoreDatabase(
          runtime.context.config.databaseUrl,
          target.toString(),
          directory,
          media,
          key,
        );
        created = true;
        assert.equal(result.verified, true);
        assert.equal(result.counts.listing, 1);
        assert.equal(result.localMedia, 2);
        const dump = resolve(directory, backup.database.file);
        const original = await readFile(dump);
        await writeFile(
          dump,
          Buffer.concat([original, Buffer.from("corruption")]),
        );
        await assert.rejects(
          restoreDatabase(
            runtime.context.config.databaseUrl,
            target.toString(),
            directory,
            media,
            key,
          ),
          /checksum/,
        );
      } finally {
        if (created)
          await runtime.context.pool.query(
            'DROP DATABASE "' + target.pathname.slice(1) + '" WITH (FORCE)',
          );
        await removeTestDirectory(directory, root);
      }
    }),
);
