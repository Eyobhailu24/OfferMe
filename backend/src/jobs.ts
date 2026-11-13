import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { StoredFile } from "./storage.js";
import { randomUUID } from "node:crypto";
import type { Context } from "./context.js";
import { lockListing, transaction } from "./exchange.js";

type Job = {
  id: string;
  user_id: string;
  actor_id: string;
  conversation_id: string;
  resource_id: string;
  kind: string;
  attempts: number;
  lease?: string;
  successful_tokens?: string[];
  receipt_ids?: { token: string; id: string }[];
};
type Ticket = {
  status: "ok" | "error";
  id?: string;
  details?: { error?: string };
};
export async function expireExchanges(ctx: Context) {
  return transaction(ctx, async (db) => {
    const rows = (
      await db.query(
        "SELECT l.id FROM listing l WHERE EXISTS(SELECT 1 FROM reservation r WHERE r.listing_id=l.id AND r.status='confirmed' AND r.expires_at<=now()) ORDER BY l.id FOR UPDATE OF l SKIP LOCKED LIMIT 100",
      )
    ).rows;
    for (const row of rows) await lockListing(db, row.id);
    await db.query(
      "UPDATE offer SET status='expired' WHERE status='pending' AND expires_at<=now()",
    );
    return rows.length;
  });
}
export async function pushAllowed(ctx: Context, job: Job) {
  const result = await ctx.pool.query(
    `SELECT 1 FROM "user" u WHERE u.id=$1
  AND NOT EXISTS(SELECT 1 FROM user_settings s WHERE s.user_id IN ($1,$2) AND (s.suspended OR s.deletion_requested_at IS NOT NULL OR (s.user_id=$1 AND NOT s.push_enabled)))
  AND NOT EXISTS(SELECT 1 FROM block b WHERE (b.user_id=$1 AND b.blocked_id=$2) OR (b.user_id=$2 AND b.blocked_id=$1))
  AND NOT EXISTS(SELECT 1 FROM conversation_mute m WHERE m.user_id=$1 AND m.conversation_id=$3)`,
    [job.user_id, job.actor_id, job.conversation_id],
  );
  return !!result.rowCount;
}
export async function processNotification(
  ctx: Context,
  send: typeof fetch = fetch,
) {
  const job = await transaction(ctx, async (db) => {
    const row = (
      await db.query(
        `SELECT * FROM notification_job WHERE (status='pending' AND available_at<=now()) OR (status='processing' AND locked_at<now()-interval '2 minutes') ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      )
    ).rows[0] as Job | undefined;
    if (!row) return;
    const lease = randomUUID();
    await db.query(
      "UPDATE notification_job SET status='processing',locked_at=now(),attempts=attempts+1,lease=$2 WHERE id=$1",
      [row.id, lease],
    );
    return { ...row, attempts: row.attempts + 1, lease };
  });
  if (!job) return false;
  try {
    if (!(await pushAllowed(ctx, job))) {
      await ctx.pool.query(
        "UPDATE notification_job SET status='suppressed',lease=NULL WHERE id=$1 AND lease=$2",
        [job.id, job.lease],
      );
      return true;
    }
    const delivered = job.successful_tokens || [];
    const devices = (
      (
        await ctx.pool.query(
          "SELECT token FROM push_device WHERE user_id=$1 ORDER BY token LIMIT 100",
          [job.user_id],
        )
      ).rows as { token: string }[]
    ).filter((d) => !delivered.includes(d.token));
    if (!devices.length) {
      await ctx.pool.query(
        "UPDATE notification_job SET status=$3,lease=NULL WHERE id=$1 AND lease=$2",
        [job.id, job.lease, delivered.length ? "sent" : "suppressed"],
      );
      return true;
    }
    const response = await send("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ctx.config.expoAccessToken
          ? { Authorization: "Bearer " + ctx.config.expoAccessToken }
          : {}),
      },
      body: JSON.stringify(
        devices.map((d) => ({
          to: d.token,
          title: "OFFERME",
          body: "You have a marketplace update. Open OFFERME to view it.",
          data: { conversationId: job.conversation_id },
          sound: "default",
          channelId: "marketplace",
        })),
      ),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Push provider unavailable");
    const result = (await response.json()) as { data?: Ticket[] };
    if (!Array.isArray(result.data) || result.data.length !== devices.length)
      throw new Error("Invalid push response");
    const receipts: { token: string; id: string }[] = [
      ...(job.receipt_ids || []),
    ];
    let transient = false;
    for (let i = 0; i < result.data.length; i++) {
      const ticket = result.data[i];
      if (ticket.status === "ok" && ticket.id) {
        receipts.push({ token: devices[i].token, id: ticket.id });
        delivered.push(devices[i].token);
      } else if (ticket.details?.error === "DeviceNotRegistered")
        await ctx.pool.query(
          "DELETE FROM push_device WHERE token=$1 AND user_id=$2",
          [devices[i].token, job.user_id],
        );
      else transient = true;
    }
    // Store successful tickets before retrying partial failures; payloads contain no message text.
    await ctx.pool.query(
      "UPDATE notification_job SET receipt_ids=$2,receipts_checked=false,successful_tokens=$4 WHERE id=$1 AND lease=$3",
      [job.id, JSON.stringify(receipts), job.lease, JSON.stringify(delivered)],
    );
    if (transient) throw new Error("Push ticket rejected");
    await ctx.pool.query(
      "UPDATE notification_job SET status='sent',lease=NULL WHERE id=$1 AND lease=$2",
      [job.id, job.lease],
    );
  } catch {
    await ctx.pool.query(
      "UPDATE notification_job SET status=$2,available_at=now()+($3::int*interval '1 second'),lease=NULL WHERE id=$1 AND lease=$4",
      [
        job.id,
        job.attempts >= 8 ? "failed" : "pending",
        Math.min(3600, 2 ** job.attempts * 5),
        job.lease,
      ],
    );
  }
  return true;
}
export async function checkPushReceipts(
  ctx: Context,
  send: typeof fetch = fetch,
) {
  const rows = (
    await ctx.pool.query(
      "SELECT id,receipt_ids,user_id FROM notification_job WHERE status='sent' AND NOT receipts_checked AND locked_at<now()-interval '15 minutes' AND receipt_ids IS NOT NULL LIMIT 50",
    )
  ).rows;
  for (const row of rows) {
    const receipts = row.receipt_ids as { token: string; id: string }[];
    if (!receipts.length) {
      await ctx.pool.query(
        "UPDATE notification_job SET receipts_checked=true WHERE id=$1",
        [row.id],
      );
      continue;
    }
    const response = await send("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ctx.config.expoAccessToken
          ? { Authorization: "Bearer " + ctx.config.expoAccessToken }
          : {}),
      },
      body: JSON.stringify({ ids: receipts.map((r) => r.id) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) continue;
    const result = (await response.json()) as { data?: Record<string, Ticket> };
    if (!result.data) continue;
    let complete = true;
    for (const receipt of receipts) {
      const status = result.data[receipt.id];
      if (!status) {
        complete = false;
        continue;
      }
      if (status.details?.error === "DeviceNotRegistered")
        await ctx.pool.query(
          "DELETE FROM push_device WHERE token=$1 AND user_id=$2",
          [receipt.token, row.user_id],
        );
      else if (status.status === "error")
        await ctx.pool.query(
          "UPDATE notification_job SET status='failed' WHERE id=$1",
          [row.id],
        );
    }
    if (complete)
      await ctx.pool.query(
        "UPDATE notification_job SET receipts_checked=true WHERE id=$1",
        [row.id],
      );
  }
  return rows.length;
}
export async function queueOrphanMedia(ctx: Context) {
  return transaction(ctx, async (db) => {
    const files = (
      await db.query(
        "SELECT m.* FROM media m WHERE m.created_at<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM listing l WHERE l.images ? m.path) ORDER BY m.created_at FOR UPDATE OF m SKIP LOCKED LIMIT 50",
      )
    ).rows;
    for (const file of files) {
      await db.query(
        "INSERT INTO media_cleanup(id,storage) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [
          file.id,
          file.storage || {
            provider: "local",
            key: file.path.split("/").at(-1),
          },
        ],
      );
      if (file.thumbnail_storage)
        await db.query(
          "INSERT INTO media_cleanup(id,storage) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [file.id + "-thumb", file.thumbnail_storage],
        );
      await db.query("DELETE FROM media WHERE id=$1", [file.id]);
    }
    return files.length;
  });
}
export async function cleanupMedia(ctx: Context) {
  return transaction(ctx, async (db) => {
    const file = (
      await db.query(
        "SELECT * FROM media_cleanup WHERE attempts<8 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!file) return false;
    try {
      const stored = file.storage as StoredFile;
      if (stored.provider === "local") {
        if (!/^[a-f0-9-]+(?:\.thumb)?\.webp$/.test(stored.key))
          throw new Error("Invalid legacy media key");
        await rm(resolve(ctx.config.uploadDir, stored.key), { force: true });
      } else await ctx.storage.remove(stored);
      await db.query("DELETE FROM media_cleanup WHERE id=$1", [file.id]);
    } catch {
      await db.query(
        "UPDATE media_cleanup SET attempts=attempts+1 WHERE id=$1",
        [file.id],
      );
    }
    return true;
  });
}
export function startJobs(ctx: Context) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let active: Promise<void> | undefined;
  async function tick() {
    try {
      await expireExchanges(ctx);
      await queueOrphanMedia(ctx);
      await cleanupMedia(ctx);
      if (ctx.config.expoPushEnabled) {
        for (let i = 0; i < 10 && !stopped; i++)
          if (!(await processNotification(ctx))) break;
        await checkPushReceipts(ctx);
      }
    } catch {
      console.error("Background work failed; will retry.");
    }
  }
  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      active = tick().finally(schedule);
    }, 2000);
    timer.unref();
  }
  schedule();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await active;
  };
}
