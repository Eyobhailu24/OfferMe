import { resolve } from "node:path";
import { configuration } from "../src/config.js";
import { backupDatabase, restoreDatabase } from "../src/backup.js";
const config = configuration(),
  key = process.env.BACKUP_ENCRYPTION_KEY;
if (config.production && !key)
  throw new Error("Production backups require BACKUP_ENCRYPTION_KEY.");
const directory = resolve(
  process.argv.find((a) => a.startsWith("--directory="))?.slice(12) ||
    ".local/backups/" + new Date().toISOString().replace(/[:.]/g, "-"),
);
if (process.argv.includes("--restore")) {
  if (!process.env.RESTORE_DATABASE_URL)
    throw new Error(
      "Set RESTORE_DATABASE_URL to a new offerme_restore_* database.",
    );
  console.info(
    JSON.stringify(
      await restoreDatabase(
        config.databaseUrl,
        process.env.RESTORE_DATABASE_URL,
        directory,
        resolve(".local/restored-media"),
        key,
      ),
    ),
  );
} else {
  const result = await backupDatabase(
    config.databaseUrl,
    directory,
    config.uploadDir,
    key,
  );
  console.info(
    JSON.stringify({
      directory,
      counts: result.counts,
      localMedia: result.localMedia.length,
      cloudMedia: result.cloudMedia,
    }),
  );
}
