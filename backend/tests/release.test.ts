import { migrate } from "../src/database/migrate.js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { recoverAccount } from "../src/recovery.js";
import sharp from "sharp";
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOTP } from "otpauth";
import { io } from "socket.io-client";
import { fixture } from "./fixture.js";
import { eraseAccount } from "../src/privacy.js";
import { cleanupMedia, processNotification } from "../src/jobs.js";
import { responseSchemas } from "../src/contracts.js";

test(
  "catalog validation, publication retries, keyset pagination and approximate nearby search",
  { timeout: 120000 },
  async () =>
    fixture(async ({ request, login, listing, runtime }) => {
      const seller = await login("+251900000301", "Catalog Seller");
      const first = await listing(seller.cookie);
      const data = (await (
        await request("/v1/listings/" + first)
      ).json()) as any;
      assert.ok(responseSchemas.Listing.safeParse(data).success);
      const input = {
        title: "Repeated publication",
        description: data.description,
        defects: data.defects,
        priceMinor: 50000,
        categoryId: "other",
        subcategory: "general",
        attributes: {},
        condition: "good",
        neighborhood: "Bole",
        negotiable: true,
        images: data.images,
        clientId: crypto.randomUUID(),
        latitude: 9.0,
        longitude: 38.76,
      };
      const create = async (body: unknown) =>
        request("/v1/listings", "POST", body, seller.cookie);
      const one = (await (await create(input)).json()) as { id: string };
      assert.ok(one.id);
      const retry = (await (await create(input)).json()) as { id: string };
      assert.equal(retry.id, one.id);
      assert.equal(
        (await create({ ...input, title: "Changed retry" })).status,
        400,
      );
      assert.equal(
        (
          await create({
            ...input,
            clientId: crypto.randomUUID(),
            categoryId: "phones",
            subcategory: "smartphones",
          })
        ).status,
        400,
      );
      assert.equal(
        (await create({ ...input, clientId: crypto.randomUUID(), latitude: 0 }))
          .status,
        400,
      );
      const catalog = (await (await request("/v1/catalog")).json()) as any;
      for (const category of catalog.categories) {
        const attrs = Object.fromEntries(
          category.fields.map((f: any) => [
            f.id,
            f.options?.[0] || "Known condition",
          ]),
        );
        assert.equal(
          (
            await create({
              ...input,
              clientId: crypto.randomUUID(),
              categoryId: category.id,
              subcategory: category.subcategories[0],
              attributes: attrs,
              latitude: null,
              longitude: null,
            })
          ).status,
          201,
        );
      }
      for (let i = 0; i < 10; i++)
        assert.equal(
          (
            await create({
              ...input,
              clientId: crypto.randomUUID(),
              title: "Pagination item " + i,
              latitude: null,
              longitude: null,
            })
          ).status,
          201,
        );
      const page = (await (await request("/v1/listings")).json()) as any;
      assert.ok(responseSchemas.Page.safeParse(page).success);
      assert.equal(page.items.length, 24);
      assert.ok(page.nextCursor);
      await create({
        ...input,
        clientId: crypto.randomUUID(),
        title: "Inserted after the first page",
        latitude: null,
        longitude: null,
      });
      const next = (await (
        await request(
          "/v1/listings?cursor=" +
            encodeURIComponent(page.nextCursor) +
            "&page=2",
        )
      ).json()) as any;
      assert.ok(next.items.length);
      assert.ok(
        next.items.every(
          (item: any) =>
            !page.items.some((previous: any) => previous.id === item.id),
        ),
      );
      assert.equal((await request("/v1/listings?cursor=invalid")).status, 400);
      const nearby = (await (
        await request("/v1/listings?latitude=9.0&longitude=38.76&radiusKm=1")
      ).json()) as any;
      assert.equal(nearby.items.length, 1);
      assert.equal(nearby.items[0].id, one.id);
      assert.ok(nearby.items[0].distanceKm < 0.2);
      assert.equal(nearby.items[0].latitude, undefined);
      assert.equal(
        (await request(data.images[0].replace(".webp", ".thumb.webp"))).status,
        200,
      );
    }),
);

test(
  "notification partial failures retry only undelivered devices",
  { timeout: 120000 },
  async () =>
    fixture(async ({ request, login, listing, runtime }) => {
      const seller = await login("+251900000301", "Push Seller"),
        buyer = await login("+251900000302", "Push Buyer");
      const id = await listing(seller.cookie);
      const c = (await (
        await request(
          "/v1/conversations",
          "POST",
          { listingId: id },
          buyer.cookie,
        )
      ).json()) as { id: string };
      for (const token of [
        "ExpoPushToken[device-one]",
        "ExpoPushToken[device-two]",
      ])
        await request("/v1/me/devices", "POST", { token }, seller.cookie);
      await request(
        "/v1/conversations/" + c.id + "/messages",
        "POST",
        {
          clientId: crypto.randomUUID(),
          body: "No private text in a push payload",
        },
        buyer.cookie,
      );
      let calls = 0;
      const send: typeof fetch = async (_url, options) => {
        const payload = JSON.parse(options!.body as string);
        assert.ok(!JSON.stringify(payload).includes("No private text"));
        calls++;
        if (calls === 1) {
          assert.equal(payload.length, 2);
          return Response.json({
            data: [
              { status: "ok", id: "ticket-one" },
              { status: "error", details: { error: "MessageRateExceeded" } },
            ],
          });
        }
        assert.equal(payload.length, 1);
        assert.equal(payload[0].to, "ExpoPushToken[device-two]");
        return Response.json({ data: [{ status: "ok", id: "ticket-two" }] });
      };
      assert.equal(await processNotification(runtime.context, send), true);
      await runtime.context.pool.query(
        "UPDATE notification_job SET available_at=now()",
      );
      assert.equal(await processNotification(runtime.context, send), true);
      assert.equal(calls, 2);
      const job = (
        await runtime.context.pool.query("SELECT * FROM notification_job")
      ).rows[0];
      assert.equal(job.status, "sent");
      assert.equal(job.successful_tokens.length, 2);
    }),
);

test(
  "deletion dry run, anonymization, session revocation and queued media removal",
  { timeout: 120000 },
  async () =>
    fixture(async ({ request, login, listing, runtime }) => {
      const user = await login("+251900000301", "Delete This Name");
      const id = await listing(user.cookie);
      const ticket = (await (
        await request("/v1/me/deletion", "POST", {}, user.cookie)
      ).json()) as { id: string };
      assert.ok(ticket.id);
      assert.equal(
        (await eraseAccount(runtime.context, ticket.id)).executed,
        false,
      );
      assert.equal(
        (await request("/v1/me", "GET", undefined, user.cookie)).status,
        200,
      );
      assert.equal(
        (await eraseAccount(runtime.context, ticket.id, true)).executed,
        true,
      );
      assert.equal(
        (await request("/v1/me", "GET", undefined, user.cookie)).status,
        401,
      );
      assert.equal((await request("/v1/listings/" + id)).status, 404);
      const row = (
        await runtime.context.pool.query(
          'SELECT name,"phoneNumber" FROM "user" WHERE id=$1',
          [user.id],
        )
      ).rows[0];
      assert.equal(row.name, "Deleted OFFERME member");
      assert.equal(row.phoneNumber, null);
      assert.equal(
        (await runtime.context.pool.query("SELECT * FROM media_cleanup"))
          .rowCount,
        2,
      );
      await cleanupMedia(runtime.context);
      await cleanupMedia(runtime.context);
      assert.equal(
        (await runtime.context.pool.query("SELECT * FROM media_cleanup"))
          .rowCount,
        0,
      );
    }),
);

test(
  "administrator second factor rejects replay and socket closes on sign-out",
  { timeout: 120000 },
  async () =>
    fixture(
      async ({ request, login, runtime }) => {
        const admin = await login("+251900000303", "MFA Admin");
        assert.equal(
          (await request("/v1/admin/reports", "GET", undefined, admin.cookie))
            .status,
          403,
        );
        const code = new TOTP({
          secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
        }).generate();
        assert.equal(
          (
            await request(
              "/v1/me/admin-verification",
              "POST",
              { code },
              admin.cookie,
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await request(
              "/v1/me/admin-verification",
              "POST",
              { code },
              admin.cookie,
            )
          ).status,
          400,
        );
        assert.equal(
          (await request("/v1/admin/reports", "GET", undefined, admin.cookie))
            .status,
          200,
        );
        const socket = io(await runtime.app.getUrl(), {
          auth: { cookie: admin.cookie },
          transports: ["websocket"],
          reconnection: false,
        });
        try {
          await new Promise<void>((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("connect_error", reject);
          });
          const rejected = io(await runtime.app.getUrl(), {
            auth: { cookie: admin.cookie },
            extraHeaders: { Origin: "https://untrusted.example" },
            transports: ["websocket"],
            reconnection: false,
          });
          try {
            await new Promise<void>((resolve, reject) => {
              rejected.once("connect_error", () => resolve());
              rejected.once("connect", () =>
                reject(new Error("Untrusted socket origin was accepted.")),
              );
            });
          } finally {
            rejected.disconnect();
          }
          const disconnected = new Promise<void>((resolve) => {
            socket.once("disconnect", () => resolve());
          });
          assert.equal(
            (await request("/api/auth/sign-out", "POST", {}, admin.cookie))
              .status,
            200,
          );
          await disconnected;
          assert.equal(socket.connected, false);
        } finally {
          socket.disconnect();
        }
      },
      {
        adminTotpSecrets: {
          "+251900000303": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
        },
      },
    ),
);

test(
  "media upload retries do not duplicate originals or thumbnails",
  { timeout: 120000 },
  async () =>
    fixture(async ({ request, login, runtime }) => {
      const seller = await login("+251900000301", "Media Seller");
      const id = crypto.randomUUID();
      const file = await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#dddddd" },
      })
        .png()
        .toBuffer();
      const send = async (bytes: Buffer) => {
        const form = new FormData();
        form.append("clientId", id);
        form.append(
          "file",
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          "photo.png",
        );
        return fetch((await runtime.app.getUrl()) + "/v1/media", {
          method: "POST",
          headers: {
            cookie: seller.cookie,
            origin: runtime.context.config.webOrigin,
          },
          body: form,
        });
      };
      const one = await send(file);
      assert.equal(one.status, 201);
      const initial = (await one.json()) as { url: string };
      const retry = await send(file);
      assert.equal(retry.status, 201);
      assert.equal(((await retry.json()) as { url: string }).url, initial.url);
      assert.equal(
        (await runtime.context.pool.query("SELECT * FROM media")).rowCount,
        1,
      );
      const other = await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#111111" },
      })
        .png()
        .toBuffer();
      assert.equal((await send(other)).status, 400);
    }),
);

test(
  "private-message reports require membership and listing restoration preserves sold state",
  { timeout: 120000 },
  async () =>
    fixture(async ({ request, login, listing }) => {
      const seller = await login("+251900000301", "Report Seller"),
        buyer = await login("+251900000302", "Report Buyer"),
        admin = await login("+251900000303", "Report Admin");
      const id = await listing(seller.cookie);
      const conversation = (await (
        await request(
          "/v1/conversations",
          "POST",
          { listingId: id },
          buyer.cookie,
        )
      ).json()) as { id: string };
      const message = (await (
        await request(
          "/v1/conversations/" + conversation.id + "/messages",
          "POST",
          {
            clientId: crypto.randomUUID(),
            body: "Message retained for report handling",
          },
          buyer.cookie,
        )
      ).json()) as { id: string };
      assert.equal(
        (
          await request(
            "/v1/reports",
            "POST",
            {
              messageId: message.id,
              reason: "Please review this message for abuse.",
            },
            admin.cookie,
          )
        ).status,
        404,
      );
      const reportResponse = await request(
        "/v1/reports",
        "POST",
        {
          messageId: message.id,
          reason: "Please review this message for abuse.",
        },
        seller.cookie,
      );
      assert.equal(reportResponse.status, 201);
      const report = (await reportResponse.json()) as { id: string };
      assert.equal(
        (
          await request(
            "/v1/admin/reports/" + report.id,
            "GET",
            undefined,
            buyer.cookie,
          )
        ).status,
        403,
      );
      const details = (await (
        await request(
          "/v1/admin/reports/" + report.id,
          "GET",
          undefined,
          admin.cookie,
        )
      ).json()) as { messageBody: string };
      assert.equal(details.messageBody, "Message retained for report handling");
      await request("/v1/listings/" + id + "/sales", "POST", {}, seller.cookie);
      await request("/v1/admin/listings/" + id, "PATCH", {}, admin.cookie);
      const restored = await request(
        "/v1/admin/listings/" + id + "/restore",
        "PATCH",
        {},
        admin.cookie,
      );
      assert.equal(restored.status, 200);
      assert.equal(
        ((await restored.json()) as { status: string }).status,
        "sold",
      );

      const reviewedItem = await listing(seller.cookie);
      const thread = (await (
        await request(
          "/v1/conversations",
          "POST",
          { listingId: reviewedItem },
          buyer.cookie,
        )
      ).json()) as { id: string };
      const sale = (await (
        await request(
          "/v1/listings/" + reviewedItem + "/sales",
          "POST",
          { conversationId: thread.id },
          seller.cookie,
        )
      ).json()) as { id: string };
      await request(
        "/v1/sales/" + sale.id + "/confirm",
        "PATCH",
        {},
        buyer.cookie,
      );
      const review = (await (
        await request(
          "/v1/sales/" + sale.id + "/reviews",
          "POST",
          { rating: 1, body: "Review for moderation testing" },
          buyer.cookie,
        )
      ).json()) as { id: string };
      assert.equal(
        (
          await request(
            "/v1/reports",
            "POST",
            {
              reviewId: review.id,
              reason: "Please review this feedback for abuse.",
            },
            seller.cookie,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "/v1/reports",
            "POST",
            { reviewId: review.id, reason: "Please review my own feedback." },
            buyer.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/v1/admin/reviews/" + review.id,
            "PATCH",
            { hidden: true, reason: "Hidden following a policy review." },
            admin.cookie,
          )
        ).status,
        200,
      );
      const reputation = (await (
        await request("/v1/users/" + seller.id + "/reputation")
      ).json()) as { count: number };
      assert.equal(reputation.count, 0);
    }),
);

test(
  "operator recovery preserves the original account, requires an empty verified placeholder and revokes sessions",
  { timeout: 120000 },
  async () =>
    fixture(async ({ request, login, listing, runtime }) => {
      const original = await login("+251900000301", "Original Member"),
        placeholder = await login("+251900000302", "Recovery Requester"),
        admin = await login("+251900000303", "Recovery Operator");
      const item = await listing(original.cookie);
      const ticket = (await (
        await request(
          "/v1/support",
          "POST",
          {
            kind: "recovery",
            body: "I can verify ownership of my original listings.",
          },
          placeholder.cookie,
        )
      ).json()) as { id: string };
      assert.equal(
        (
          await recoverAccount(
            runtime.context,
            ticket.id,
            original.id,
            admin.id,
          )
        ).executed,
        false,
      );
      await request("/v1/favorites/" + item, "POST", {}, placeholder.cookie);
      await assert.rejects(
        recoverAccount(runtime.context, ticket.id, original.id, admin.id, true),
        /marketplace activity/,
      );
      await request(
        "/v1/favorites/" + item,
        "DELETE",
        undefined,
        placeholder.cookie,
      );
      assert.equal(
        (
          await recoverAccount(
            runtime.context,
            ticket.id,
            original.id,
            admin.id,
            true,
          )
        ).executed,
        true,
      );
      assert.equal(
        (await request("/v1/me", "GET", undefined, original.cookie)).status,
        401,
      );
      assert.equal(
        (await request("/v1/me", "GET", undefined, placeholder.cookie)).status,
        401,
      );
      const owner = (
        await runtime.context.pool.query(
          'SELECT "phoneNumber",name FROM "user" WHERE id=$1',
          [original.id],
        )
      ).rows[0];
      assert.equal(owner.phoneNumber, "+251900000302");
      assert.equal(owner.name, "Original Member");
      assert.equal(
        (
          await runtime.context.pool.query(
            "SELECT seller_id FROM listing WHERE id=$1",
            [item],
          )
        ).rows[0].seller_id,
        original.id,
      );
    }),
);

test(
  "migration checksums survive Windows/Linux line endings while rejecting changed SQL",
  { timeout: 120000 },
  async () =>
    fixture(async ({ runtime }) => {
      const name = "003_exchange_and_operations.sql";
      const sql = (await readFile("migrations/" + name, "utf8")).replace(
        /\r\n/g,
        "\n",
      );
      const hash = (value: string) =>
        createHash("sha256").update(value).digest("hex");
      await runtime.context.pool.query(
        "UPDATE offerme_migration SET checksum=$2 WHERE name=$1",
        [name, hash(sql.replace(/\n/g, "\r\n"))],
      );
      await migrate(runtime.context.pool, runtime.context.auth);
      assert.equal(
        (
          await runtime.context.pool.query(
            "SELECT checksum FROM offerme_migration WHERE name=$1",
            [name],
          )
        ).rows[0].checksum,
        hash(sql),
      );
      await runtime.context.pool.query(
        "UPDATE offerme_migration SET checksum=$2 WHERE name=$1",
        [name, "0".repeat(64)],
      );
      await assert.rejects(
        migrate(runtime.context.pool, runtime.context.auth),
        /changed after being applied/,
      );
    }),
);
