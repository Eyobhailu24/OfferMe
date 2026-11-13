import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat, open, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { resolve, join, basename } from "node:path";
import pg from "pg";
const tables = [
  "user",
  "listing",
  "media",
  "conversation",
  "message",
  "sale",
  "review",
  "support_request",
  "offerme_migration",
];
async function checksum(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function connection(url: string) {
  const parsed = new URL(url);
  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: parsed.pathname.slice(1),
  };
}
async function pgTool(
  name: string,
  url: string,
  args: string[],
  input?: string,
  output?: string,
) {
  const executable = process.env.PG_BIN
    ? join(
        process.env.PG_BIN,
        name + (process.platform === "win32" ? ".exe" : ""),
      )
    : process.platform === "win32"
      ? join("C:/Program Files/PostgreSQL/18/bin", name + ".exe")
      : name;
  const env = { ...process.env, ...connection(url) };
  const container = process.env.PG_TOOL_CONTAINER;
  const command = container ? "docker" : executable;
  const commandArgs = container
    ? [
        "exec",
        "-i",
        ...Object.keys(connection(url)).flatMap((key) => ["--env", key]),
        container,
        name,
        ...args,
      ]
    : args;
  const infile = input ? await open(input, "r") : undefined,
    outfile = output ? await open(output, "wx") : undefined;
  try {
    await new Promise<void>((done, reject) => {
      const child = spawn(command, commandArgs, {
        env,
        windowsHide: true,
        stdio: [infile?.fd || "ignore", outfile?.fd || "ignore", "pipe"],
      });
      let detail = "";
      child.stderr?.on("data", (data) => {
        detail += String(data);
      });
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? done()
          : reject(
              new Error(
                name +
                  " failed; verify tool/server versions and database permissions.",
              ),
            ),
      );
    });
  } finally {
    await infile?.close();
    await outfile?.close();
  }
}
type Artifact = { file: string; sha256: string; iv?: string; tag?: string };
async function protect(file: string, key?: string): Promise<Artifact> {
  if (!key) return { file: basename(file), sha256: await checksum(file) };
  if (!/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error("BACKUP_ENCRYPTION_KEY must be a 32-byte hex key.");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv),
    encrypted = file + ".enc";
  await pipeline(
    createReadStream(file),
    cipher,
    createWriteStream(encrypted, { flags: "wx", mode: 0o600 }),
  );
  await rm(file);
  return {
    file: basename(encrypted),
    sha256: await checksum(encrypted),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}
async function unprotect(directory: string, item: Artifact, key?: string) {
  if (basename(item.file) !== item.file)
    throw new Error("Invalid artifact name.");
  const file = join(directory, item.file);
  if ((await checksum(file)) !== item.sha256)
    throw new Error("Backup checksum mismatch.");
  if (!item.iv) return file;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error("Provide the backup encryption key.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(item.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(item.tag!, "hex"));
  const plaintext = join(
    directory,
    ".restore-" + randomBytes(8).toString("hex"),
  );
  await pipeline(
    createReadStream(file),
    decipher,
    createWriteStream(plaintext, { flags: "wx", mode: 0o600 }),
  );
  return plaintext;
}
async function counts(pool: pg.Pool) {
  const result: Record<string, number> = {};
  for (const table of tables)
    result[table] = Number(
      (await pool.query('SELECT count(*) AS count FROM "' + table + '"'))
        .rows[0].count,
    );
  return result;
}
export async function backupDatabase(
  url: string,
  directory: string,
  uploads: string,
  key?: string,
) {
  if (key && !/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error("BACKUP_ENCRYPTION_KEY must be a 32-byte hex key.");
  await mkdir(directory, { recursive: true });
  const dump = join(directory, "database.dump");
  const pool = new pg.Pool({ connectionString: url });
  try {
    // Record counts and dump share one exported MVCC snapshot, even while users write.
    const db = await pool.connect();
    let rowCounts: Record<string, number> = {};
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const snapshot = (
        await db.query("SELECT pg_export_snapshot() AS snapshot")
      ).rows[0].snapshot;
      for (const table of tables)
        rowCounts[table] = Number(
          (await db.query('SELECT count(*) AS count FROM "' + table + '"'))
            .rows[0].count,
        );
      await pgTool(
        "pg_dump",
        url,
        ["--format=custom", "--no-owner", "--snapshot=" + snapshot],
        undefined,
        dump,
      );
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
    const database = await protect(dump, key);
    const localMedia: Artifact[] = [];
    let cloudMedia = 0;
    const files = (
      await pool.query(
        "SELECT path,storage,thumbnail_path,thumbnail_storage FROM media",
      )
    ).rows;
    for (const item of files)
      for (const [path, storage] of [
        [item.path, item.storage],
        [item.thumbnail_path, item.thumbnail_storage],
      ]) {
        if (!path) continue;
        if (storage && storage.provider !== "local") {
          cloudMedia++;
          continue;
        }
        const name = basename(path);
        if (!/^[a-f0-9-]+(?:\.thumb)?\.webp$/.test(name))
          throw new Error("Invalid legacy media filename.");
        const destination = join(directory, name);
        await pipeline(
          createReadStream(join(uploads, name)),
          createWriteStream(destination, { flags: "wx", mode: 0o600 }),
        );
        localMedia.push(await protect(destination, key));
      }
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      database,
      counts: rowCounts,
      localMedia,
      cloudMedia,
      cloudMediaNote:
        "Cloud objects require provider versioning/replication and a separate object restore drill.",
    };
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600, flag: "wx" },
    );
    return manifest;
  } finally {
    await pool.end();
  }
}
export async function restoreDatabase(
  sourceUrl: string,
  targetUrl: string,
  directory: string,
  mediaDirectory: string,
  key?: string,
) {
  const target = new URL(targetUrl),
    source = new URL(sourceUrl);
  if (target.hostname !== source.hostname || target.port !== source.port)
    throw new Error(
      "The isolated restore database must use the same PostgreSQL server as the source connection.",
    );
  if (
    !/^\/offerme_restore_[a-zA-Z0-9_]+$/.test(target.pathname) ||
    target.pathname === source.pathname
  )
    throw new Error("Restore requires a new database named offerme_restore_*.");
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) &&
    process.env.ALLOW_REMOTE_RESTORE !== "true"
  )
    throw new Error("Remote restore requires ALLOW_REMOTE_RESTORE=true.");
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  ) as {
    format: number;
    database: Artifact;
    counts: Record<string, number>;
    localMedia: Artifact[];
    cloudMedia: number;
  };
  if (manifest.format !== 1) throw new Error("Unsupported backup format.");
  const plaintext = await unprotect(directory, manifest.database, key);
  const owner = new pg.Pool({ connectionString: sourceUrl });
  try {
    await owner.query('CREATE DATABASE "' + target.pathname.slice(1) + '"');
    await pgTool(
      "pg_restore",
      targetUrl,
      ["--exit-on-error", "--no-owner", "--dbname=" + target.pathname.slice(1)],
      plaintext,
    );
  } finally {
    await owner.end();
    if (plaintext !== join(directory, manifest.database.file))
      await rm(plaintext, { force: true });
  }
  const restored = new pg.Pool({ connectionString: targetUrl });
  try {
    const actual = await counts(restored);
    if (JSON.stringify(actual) !== JSON.stringify(manifest.counts))
      throw new Error("Restored record counts do not match the snapshot.");
    await mkdir(mediaDirectory, { recursive: true });
    for (const item of manifest.localMedia) {
      const clear = await unprotect(directory, item, key);
      const destination = join(mediaDirectory, item.file.replace(/\.enc$/, ""));
      await pipeline(
        createReadStream(clear),
        createWriteStream(destination, { flags: "wx", mode: 0o600 }),
      );
      if (clear !== join(directory, item.file))
        await rm(clear, { force: true });
    }
    return {
      counts: actual,
      localMedia: manifest.localMedia.length,
      cloudMedia: manifest.cloudMedia,
      verified: true,
    };
  } finally {
    await restored.end();
  }
}
