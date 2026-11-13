import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Context } from "./context.js";
import { transaction } from "./exchange.js";
export async function eraseAccount(
  ctx: Context,
  requestId: string,
  execute = false,
) {
  return transaction(ctx, async (db) => {
    const ticket = (
      await db.query(
        "SELECT * FROM support_request WHERE id=$1 AND kind='deletion' FOR UPDATE",
        [requestId],
      )
    ).rows[0];
    if (!ticket) throw new NotFoundException("Deletion request not found.");
    if (ticket.status !== "open")
      throw new BadRequestException("This deletion request is no longer open.");
    const user = (
      await db.query(
        'SELECT id,"phoneNumber" FROM "user" WHERE id=$1 FOR UPDATE',
        [ticket.user_id],
      )
    ).rows[0];
    const media = (
      await db.query(
        "SELECT id,path,storage,thumbnail_storage FROM media WHERE owner_id=$1",
        [user.id],
      )
    ).rows;
    if (!execute)
      return {
        requestId,
        userId: user.id,
        mediaCount: media.length,
        executed: false,
      };
    await db.query('DELETE FROM session WHERE "userId"=$1', [user.id]);
    await db.query('DELETE FROM account WHERE "userId"=$1', [user.id]);
    await db.query(
      'UPDATE "user" SET name=$2,email=$3,"phoneNumber"=NULL,"phoneNumberVerified"=false,image=NULL,"emailVerified"=false,"updatedAt"=now() WHERE id=$1',
      [
        user.id,
        "Deleted OFFERME member",
        "deleted-" + user.id + "@offerme.invalid",
      ],
    );
    await db.query(
      "INSERT INTO user_settings(user_id,suspended,push_enabled,erased_at) VALUES($1,true,false,now()) ON CONFLICT(user_id) DO UPDATE SET suspended=true,push_enabled=false,erased_at=now(),suspension_reason=NULL",
      [user.id],
    );
    await db.query(
      "UPDATE listing SET title='Removed item',description='Removed after account deletion.',defects='Unavailable',images='[]',attributes='{}',latitude=NULL,longitude=NULL,status=CASE WHEN status IN ('sold','removed') THEN status ELSE 'archived' END WHERE seller_id=$1",
      [user.id],
    );
    await db.query(
      "UPDATE message SET body='[Message removed after account deletion]' WHERE sender_id=$1",
      [user.id],
    );
    await db.query("UPDATE review SET body='' WHERE author_id=$1", [user.id]);
    await db.query(
      "UPDATE support_request SET body='[Removed after account deletion]',response=NULL WHERE user_id=$1",
      [user.id],
    );
    await db.query(
      "UPDATE report SET reason='[Removed after account deletion]' WHERE reporter_id=$1",
      [user.id],
    );
    for (const table of [
      "favorite",
      "saved_search",
      "push_device",
      "conversation_mute",
      "conversation_read",
    ])
      await db.query(`DELETE FROM ${table} WHERE user_id=$1`, [user.id]);
    await db.query("DELETE FROM block WHERE user_id=$1 OR blocked_id=$1", [
      user.id,
    ]);
    await db.query(
      "UPDATE notification_job SET status='suppressed',lease=NULL WHERE user_id=$1 OR actor_id=$1",
      [user.id],
    );
    for (const file of media) {
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
    }
    await db.query("DELETE FROM media WHERE owner_id=$1", [user.id]);
    await db.query(
      "UPDATE support_request SET status='resolved',resolved_at=now(),response='Account anonymized; shared exchange records retain pseudonymous identifiers.' WHERE id=$1",
      [requestId],
    );
    await db.query(
      "INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,'account.erased',$3)",
      [crypto.randomUUID(), user.id, user.id],
    );
    return {
      requestId,
      userId: user.id,
      mediaCount: media.length,
      executed: true,
    };
  });
}
