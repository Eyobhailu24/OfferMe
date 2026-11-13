import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.js";
import { expireExchanges, processNotification } from "../src/jobs.js";

test(
  "competing reservations, expiry, sale participants and eligible reviews",
  { timeout: 120000 },
  async () =>
    fixture(async ({ runtime, request, login, listing }) => {
      const seller = await login("+251900000301", "Exchange Seller");
      const buyer = await login("+251900000302", "Exchange Buyer");
      const other = await login("+251900000303", "Exchange Other");
      const id = await listing(seller.cookie);
      const thread = async (cookie: string) =>
        (
          (await (
            await request(
              "/v1/conversations",
              "POST",
              { listingId: id },
              cookie,
            )
          ).json()) as { id: string }
        ).id;
      const c = await thread(buyer.cookie),
        c2 = await thread(other.cookie);
      const expiry = new Date(Date.now() + 3600000).toISOString();
      const attempts = await Promise.all(
        [c, c2].map((conversationId) =>
          request(
            "/v1/listings/" + id + "/reservations",
            "POST",
            { conversationId, expiresAt: expiry },
            seller.cookie,
          ),
        ),
      );
      assert.deepEqual(attempts.map((x) => x.status).sort(), [201, 400]);
      assert.equal(
        (
          await runtime.context.pool.query(
            "SELECT * FROM reservation WHERE listing_id=$1 AND status='confirmed'",
            [id],
          )
        ).rowCount,
        1,
      );
      await runtime.context.pool.query(
        "UPDATE reservation SET expires_at=now()-interval '1 second' WHERE listing_id=$1",
        [id],
      );
      await expireExchanges(runtime.context);
      assert.equal(
        (
          await runtime.context.pool.query(
            "SELECT status FROM listing WHERE id=$1",
            [id],
          )
        ).rows[0].status,
        "active",
      );
      assert.equal(
        (
          await request(
            "/v1/listings/" + id + "/reservations",
            "POST",
            { conversationId: c, expiresAt: expiry },
            buyer.cookie,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            "/v1/listings/" + id + "/reservations",
            "POST",
            { conversationId: c, expiresAt: expiry },
            seller.cookie,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "/v1/conversations/" + c2 + "/offers",
            "POST",
            { amountMinor: 40000 },
            other.cookie,
          )
        ).status,
        400,
      );
      const response = await request(
        "/v1/listings/" + id + "/sales",
        "POST",
        { conversationId: c },
        seller.cookie,
      );
      assert.equal(response.status, 201);
      const sale = (await response.json()) as { id: string };
      assert.equal(
        (
          (await (
            await request(
              "/v1/listings/" + id + "/sales",
              "POST",
              { conversationId: c },
              seller.cookie,
            )
          ).json()) as { id: string }
        ).id,
        sale.id,
      );
      assert.equal(
        (
          await request(
            "/v1/sales/" + sale.id + "/reviews",
            "POST",
            { rating: 5, body: "Helpful seller" },
            buyer.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/v1/sales/" + sale.id + "/confirm",
            "PATCH",
            {},
            other.cookie,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            "/v1/sales/" + sale.id + "/confirm",
            "PATCH",
            {},
            buyer.cookie,
          )
        ).status,
        200,
      );
      const review = { rating: 5, body: "Helpful seller" };
      assert.equal(
        (
          await request(
            "/v1/sales/" + sale.id + "/reviews",
            "POST",
            review,
            buyer.cookie,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "/v1/sales/" + sale.id + "/reviews",
            "POST",
            review,
            buyer.cookie,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "/v1/sales/" + sale.id + "/reviews",
            "POST",
            { ...review, rating: 1 },
            buyer.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/v1/sales/" + sale.id + "/reviews",
            "POST",
            review,
            other.cookie,
          )
        ).status,
        404,
      );
      const reputation = (await (
        await request("/v1/users/" + seller.id + "/reputation")
      ).json()) as { count: number; rating: number; phoneNumber?: string };
      assert.equal(reputation.count, 1);
      assert.equal(reputation.rating, 5);
      assert.equal(reputation.phoneNumber, undefined);
      assert.equal(
        (
          await request(
            "/v1/conversations/" + c + "/meetups",
            "POST",
            { place: "Public cafe in Bole", scheduledAt: expiry },
            buyer.cookie,
          )
        ).status,
        400,
      );
      const outside = await listing(seller.cookie);
      const outsideSale = (await (
        await request(
          "/v1/listings/" + outside + "/sales",
          "POST",
          {},
          seller.cookie,
        )
      ).json()) as { id: string };
      assert.equal(
        (
          await request(
            "/v1/sales/" + outsideSale.id + "/reviews",
            "POST",
            review,
            seller.cookie,
          )
        ).status,
        400,
      );
    }),
);

test(
  "counteroffers, expiry, read cursors and durable notification suppression",
  { timeout: 120000 },
  async () =>
    fixture(async ({ runtime, request, login, listing }) => {
      const seller = await login("+251900000301", "Offer Seller");
      const buyer = await login("+251900000302", "Offer Buyer");
      const id = await listing(seller.cookie);
      const c = (await (
        await request(
          "/v1/conversations",
          "POST",
          { listingId: id },
          buyer.cookie,
        )
      ).json()) as { id: string };
      const path = "/v1/conversations/" + c.id;
      const original = (await (
        await request(
          path + "/offers",
          "POST",
          { amountMinor: 45000 },
          buyer.cookie,
        )
      ).json()) as { id: string };
      const counter = (await (
        await request(
          path + "/offers",
          "POST",
          { amountMinor: 48000, previousId: original.id },
          seller.cookie,
        )
      ).json()) as { id: string };
      assert.ok(counter.id);
      assert.equal(
        (
          await request(
            path + "/offers/" + original.id,
            "PATCH",
            { status: "accepted" },
            seller.cookie,
          )
        ).status,
        400,
      );
      await runtime.context.pool.query(
        "UPDATE offer SET expires_at=now()-interval '1 second' WHERE id=$1",
        [counter.id],
      );
      assert.equal(
        (
          await request(
            path + "/offers/" + counter.id,
            "PATCH",
            { status: "accepted" },
            buyer.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            path + "/messages",
            "POST",
            {
              clientId: crypto.randomUUID(),
              body: "Wrong account queue",
              expectedSenderId: seller.id,
            },
            buyer.cookie,
          )
        ).status,
        403,
      );
      const msg = (await (
        await request(
          path + "/messages",
          "POST",
          { clientId: crypto.randomUUID(), body: "Meet in a public place" },
          buyer.cookie,
        )
      ).json()) as { id: string };
      const jobs = await runtime.context.pool.query(
        "SELECT * FROM notification_job WHERE kind='message' AND resource_id=$1",
        [msg.id],
      );
      assert.equal(jobs.rowCount, 1);
      assert.equal(
        (
          await request(
            path + "/read",
            "PATCH",
            { messageId: msg.id },
            seller.cookie,
          )
        ).status,
        200,
      );
      const inbox = (await (
        await request("/v1/conversations", "GET", undefined, seller.cookie)
      ).json()) as { items: { unreadCount: number }[] };
      assert.equal(inbox.items[0].unreadCount, 0);
      await request(
        "/v1/me/devices",
        "POST",
        { token: "ExpoPushToken[test-device]" },
        seller.cookie,
      );
      await request("/v1/blocks/" + buyer.id, "POST", {}, seller.cookie);
      let calls = 0;
      const send = async () => {
        calls++;
        throw new Error("Must not deliver blocked notifications");
      };
      while (await processNotification(runtime.context, send)) {}
      assert.equal(calls, 0);
      assert.equal(
        (
          await runtime.context.pool.query(
            "SELECT count(*)::int AS count FROM notification_job WHERE status='suppressed'",
          )
        ).rows[0].count,
        3,
      );
      assert.equal(
        (
          await request(
            "/v1/blocks/" + buyer.id,
            "DELETE",
            undefined,
            seller.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request(path + "/mute", "PATCH", { muted: true }, seller.cookie))
          .status,
        200,
      );
      await request(
        path + "/messages",
        "POST",
        { clientId: crypto.randomUUID(), body: "Another update" },
        buyer.cookie,
      );
      await processNotification(runtime.context, send);
      assert.equal(calls, 0);
    }),
);

test(
  "private saved searches, account export, support authorization and suspension",
  { timeout: 120000 },
  async () =>
    fixture(async ({ request, login }) => {
      const buyer = await login("+251900000302", "Private Buyer");
      const admin = await login("+251900000303", "Support Admin");
      const response = await request(
        "/v1/saved-searches",
        "POST",
        {
          name: "Phones nearby",
          filters: { category: "phones", neighborhood: "Bole" },
        },
        buyer.cookie,
      );
      assert.equal(response.status, 201);
      const search = (await response.json()) as { id: string };
      await request(
        "/v1/saved-searches/" + search.id,
        "DELETE",
        undefined,
        admin.cookie,
      );
      assert.equal(
        (
          (await (
            await request("/v1/saved-searches", "GET", undefined, buyer.cookie)
          ).json()) as { items: unknown[] }
        ).items.length,
        1,
      );
      const ticket = (await (
        await request(
          "/v1/support",
          "POST",
          { kind: "support", body: "Please help me with my account settings." },
          buyer.cookie,
        )
      ).json()) as { id: string };
      assert.equal(
        (await request("/v1/admin/support", "GET", undefined, buyer.cookie))
          .status,
        403,
      );
      assert.equal(
        (
          await request(
            "/v1/admin/support/" + ticket.id,
            "PATCH",
            { status: "resolved", response: "Your request has been reviewed." },
            admin.cookie,
          )
        ).status,
        200,
      );
      const exported = (await (
        await request("/v1/me/export", "GET", undefined, buyer.cookie)
      ).json()) as { profile: { id: string }; searches: unknown[] };
      assert.equal(exported.profile.id, buyer.id);
      assert.equal(exported.searches.length, 1);
      assert.equal(
        (
          await request(
            "/v1/admin/users/" + buyer.id,
            "PATCH",
            { suspended: true, reason: "Suspended for policy review." },
            admin.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/v1/me", "GET", undefined, buyer.cookie)).status,
        401,
      );
    }),
);
