import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { Context } from "./context.js";
import { transaction } from "./exchange.js";
// Operator procedure after human ownership verification; never exposed as a public transfer endpoint.
export async function recoverAccount(
  ctx: Context,
  requestId: string,
  targetId: string,
  operatorId: string,
  execute = false,
) {
  return transaction(ctx, async (db) => {
    const operator = (
      await db.query(
        'SELECT id,"phoneNumber","phoneNumberVerified" FROM "user" WHERE id=$1',
        [operatorId],
      )
    ).rows[0];
    if (
      !operator?.phoneNumberVerified ||
      !ctx.config.adminPhones.includes(operator.phoneNumber)
    )
      throw new ForbiddenException(
        "A configured administrator must be recorded as the operator.",
      );
    const ticket = (
      await db.query(
        "SELECT * FROM support_request WHERE id=$1 AND kind='recovery' AND status='open' FOR UPDATE",
        [requestId],
      )
    ).rows[0];
    if (!ticket)
      throw new NotFoundException("Open recovery request not found.");
    const sourceId = ticket.user_id;
    if (sourceId === targetId)
      throw new BadRequestException(
        "Use a fresh verified account to request recovery.",
      );
    const users = (
      await db.query(
        'SELECT id,"phoneNumber","phoneNumberVerified","createdAt" FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',
        [[sourceId, targetId]],
      )
    ).rows;
    const source = users.find((u) => u.id === sourceId),
      target = users.find((u) => u.id === targetId);
    if (!source || !target) throw new NotFoundException("Account not found.");
    if (
      !source.phoneNumberVerified ||
      !source.phoneNumber ||
      new Date(source.createdAt).getTime() < Date.now() - 7 * 86400000
    )
      throw new BadRequestException(
        "Recovery requires a fresh account with a verified reachable number.",
      );
    if (
      ctx.config.adminPhones.includes(source.phoneNumber) ||
      ctx.config.adminPhones.includes(target.phoneNumber)
    )
      throw new BadRequestException(
        "Administrator accounts require a separate operator recovery procedure.",
      );
    const restricted = await db.query(
      "SELECT 1 FROM user_settings WHERE user_id=ANY($1::text[]) AND (suspended OR deletion_requested_at IS NOT NULL OR erased_at IS NOT NULL)",
      [[sourceId, targetId]],
    );
    if (restricted.rowCount)
      throw new BadRequestException(
        "Resolve account restrictions before recovery.",
      );
    const activity = (
      await db.query(
        "SELECT (SELECT count(*) FROM listing WHERE seller_id=$1)+(SELECT count(*) FROM media WHERE owner_id=$1)+(SELECT count(*) FROM conversation WHERE buyer_id=$1 OR seller_id=$1)+(SELECT count(*) FROM favorite WHERE user_id=$1)+(SELECT count(*) FROM review WHERE author_id=$1) AS count",
        [sourceId],
      )
    ).rows[0];
    if (Number(activity.count) !== 0)
      throw new BadRequestException(
        "The new account has marketplace activity. Use a separately reviewed account-merge procedure.",
      );
    if (!execute) return { requestId, targetId, sourceId, executed: false };
    await db.query('DELETE FROM session WHERE "userId"=ANY($1::text[])', [
      [sourceId, targetId],
    ]);
    await db.query("DELETE FROM push_device WHERE user_id=ANY($1::text[])", [
      [sourceId, targetId],
    ]);
    await db.query(
      'UPDATE "user" SET "phoneNumber"=NULL,"phoneNumberVerified"=false,name=$2,email=$3,image=NULL,"updatedAt"=now() WHERE id=$1',
      [
        sourceId,
        "Closed recovery account",
        "closed-" + sourceId + "@phone.offerme.invalid",
      ],
    );
    await db.query(
      "INSERT INTO user_settings(user_id,suspended,push_enabled,erased_at) VALUES($1,true,false,now()) ON CONFLICT(user_id) DO UPDATE SET suspended=true,push_enabled=false,erased_at=now()",
      [sourceId],
    );
    const email =
      createHash("sha256").update(source.phoneNumber).digest("hex") +
      "@phone.offerme.invalid";
    await db.query(
      'UPDATE "user" SET "phoneNumber"=$2,"phoneNumberVerified"=true,email=$3,"updatedAt"=now() WHERE id=$1',
      [targetId, source.phoneNumber, email],
    );
    await db.query(
      "UPDATE support_request SET user_id=$2,status='resolved',resolved_at=now(),response='Access restored after operator verification. All old sessions were revoked. Sign in with your verified reachable number.' WHERE id=$1",
      [requestId, targetId],
    );
    await db.query(
      "INSERT INTO audit_event(id,actor_id,action,target_id,metadata) VALUES($1,$2,'account.recovered',$3,$4)",
      [
        randomUUID(),
        operatorId,
        targetId,
        JSON.stringify({ requestId, sourceId }),
      ],
    );
    return { requestId, targetId, sourceId, executed: true };
  });
}
