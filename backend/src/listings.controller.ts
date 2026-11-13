import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { Context, CONTEXT } from "./context.js";
import { searchTerms } from "./search.js";
import { categoryRules } from "./category-rules.js";
import { categories, neighborhoods, conditions } from "./catalog.js";
import { listingInput, profileInput } from "./validation.js";
import {
  lockListing,
  reportSale,
  setListingStatus,
  transaction,
} from "./exchange.js";
import { listings, favorites } from "./database/schema.js";

const publicSelect = `SELECT l.id,l.seller_id AS "sellerId",l.title,l.description,l.defects,l.price_minor AS "priceMinor",l.category_id AS "categoryId",l.condition,l.neighborhood,l.negotiable,l.status,l.images,l.demo,l.subcategory,l.attributes,l.created_at AS "createdAt",u.name AS "sellerName",u."createdAt" AS "sellerSince",u."phoneNumberVerified" AS "sellerPhoneVerified" FROM listing l JOIN "user" u ON u.id=l.seller_id`;

@ApiTags("Marketplace")
@Controller("v1")
export class ListingsController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  @Get("health") health() {
    return {
      status: "ok",
      name: "OFFERME",
      version: "0.1.0",
      market: "Addis Ababa",
    };
  }
  @Get("ready") async ready() {
    try {
      await this.ctx.pool.query("SELECT 1");
      return { status: "ready" };
    } catch {
      throw new (await import("@nestjs/common")).ServiceUnavailableException(
        "Database unavailable.",
      );
    }
  }
  @Get("admin/health") async operationHealth(@Req() req: Request) {
    await this.ctx.admin(req);
    return {
      jobs: (
        await this.ctx.pool.query(
          "SELECT status,count(*)::int AS count,min(created_at) AS oldest FROM notification_job GROUP BY status",
        )
      ).rows,
      failedMedia: (
        await this.ctx.pool.query(
          "SELECT count(*)::int AS count FROM media_cleanup WHERE attempts>=8",
        )
      ).rows[0].count,
    };
  }
  @Post("admin/jobs/:id/retry") async retryJob(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await this.ctx.admin(req);
    await this.ctx.pool.query(
      "UPDATE notification_job SET status='pending',attempts=0,available_at=now(),lease=NULL WHERE id=$1 AND status='failed'",
      [id],
    );
    return { retried: true };
  }
  @Get("catalog") catalog() {
    return {
      categories: categories.map((c) => ({ ...c, ...categoryRules[c.id] })),
      neighborhoods,
      conditions,
      currency: "ETB",
      city: "Addis Ababa",
    };
  }
  @Get("me") async me(@Req() req: Request) {
    const user = await this.ctx.user(req);
    const session = await this.ctx.session(req);
    const adminMfaRequired =
      !!this.ctx.config.adminTotpSecrets[user.phoneNumber || ""];
    const adminVerified =
      !adminMfaRequired ||
      !!(
        await this.ctx.pool.query(
          "SELECT 1 FROM admin_grant WHERE session_id=$1 AND expires_at>now()",
          [session!.session.id],
        )
      ).rowCount;
    return {
      adminMfaRequired,
      adminVerified,
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      phoneNumberVerified: user.phoneNumberVerified,
      createdAt: user.createdAt,
      admin:
        !!user.phoneNumberVerified &&
        this.ctx.config.adminPhones.includes(user.phoneNumber || ""),
    };
  }
  @Patch("me") async profile(@Req() req: Request, @Body() input: unknown) {
    const user = await this.ctx.user(req);
    const data = profileInput.parse(input);
    await this.ctx.pool.query(
      'UPDATE "user" SET name=$1,"updatedAt"=now() WHERE id=$2',
      [data.name, user.id],
    );
    return { id: user.id, name: data.name };
  }
  @Get("listings") async browse(
    @Query() query: Record<string, string>,
    @Req() req: Request,
  ) {
    query = z.record(z.string(), z.string().max(500)).parse(query);
    const params: unknown[] = [];
    const clauses = ["l.status='active'"];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(sql.replace("?", "$" + params.length));
    };
    clauses.push(
      "NOT EXISTS(SELECT 1 FROM user_settings us WHERE us.user_id=l.seller_id AND us.suspended)",
    );
    const session = await this.ctx.session(req);
    if (session) {
      params.push(session.user.id);
      clauses.push(
        `NOT EXISTS(SELECT 1 FROM block b WHERE (b.user_id=$${params.length} AND b.blocked_id=l.seller_id) OR (b.blocked_id=$${params.length} AND b.user_id=l.seller_id))`,
      );
    }
    if (query.q?.trim()) {
      params.push(searchTerms(query.q));
      clauses.push(
        `lower(l.title || ' ' || l.description) LIKE ANY($${params.length}::text[])`,
      );
    }
    if (query.category) add("l.category_id=?", query.category);
    if (query.subcategory) add("l.subcategory=?", query.subcategory);
    if (query.neighborhood) add("l.neighborhood=?", query.neighborhood);
    if (query.condition) add("l.condition=?", query.condition);
    if (query.min)
      add("l.price_minor>=?", z.coerce.number().int().min(0).parse(query.min));
    if (query.max)
      add("l.price_minor<=?", z.coerce.number().int().min(0).parse(query.max));
    if (query.seller) add("l.seller_id=?", query.seller);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(query.page || 1);
    let distance = "";
    let order =
      query.sort === "price_low"
        ? "l.price_minor ASC,l.id ASC"
        : query.sort === "price_high"
          ? "l.price_minor DESC,l.id DESC"
          : "l.created_at DESC,l.id DESC";
    if (query.latitude !== undefined || query.longitude !== undefined) {
      const latitude = z.coerce
          .number()
          .min(8.8)
          .max(9.15)
          .parse(query.latitude),
        longitude = z.coerce
          .number()
          .min(38.6)
          .max(39.0)
          .parse(query.longitude);
      const radius = z.coerce
        .number()
        .min(0.1)
        .max(100)
        .parse(query.radiusKm || 10);
      params.push(latitude, longitude, radius);
      const lat = "$" + (params.length - 2),
        lng = "$" + (params.length - 1),
        range = "$" + params.length;
      distance = this.ctx.config.postgisEnabled
        ? `ST_Distance(l.approx_location,ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography)/1000`
        : `6371*acos(LEAST(1.0,GREATEST(-1.0,sin(radians(l.latitude))*sin(radians(${lat}::float))+cos(radians(l.latitude))*cos(radians(${lat}::float))*cos(radians(l.longitude-${lng}::float)))))`;
      clauses.push("l.latitude IS NOT NULL");
      clauses.push(
        this.ctx.config.postgisEnabled
          ? `ST_DWithin(l.approx_location,ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography,${range}::float*1000)`
          : distance + "<=" + range + "::float",
      );
      // Stable recency order within radius; precise coordinates are never returned.
    }
    const count = (
      await this.ctx.pool.query(
        `SELECT count(*)::int AS total FROM listing l WHERE ${clauses.join(" AND ")}`,
        params,
      )
    ).rows[0].total;
    if (query.cursor) {
      let cursor: {
        id: string;
        createdAt: string;
        priceMinor: number;
        sort: string;
      };
      try {
        cursor = z
          .object({
            id: z.string().uuid(),
            createdAt: z.iso.datetime({ offset: true }),
            priceMinor: z.number().int(),
            sort: z.string(),
          })
          .parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString()));
      } catch {
        throw new BadRequestException("Invalid search cursor.");
      }
      if (cursor.sort !== (query.sort || "recent"))
        throw new BadRequestException(
          "This cursor belongs to a different sorting order.",
        );
      params.push(
        query.sort?.startsWith("price_") ? cursor.priceMinor : cursor.createdAt,
        cursor.id,
      );
      const column = query.sort?.startsWith("price_")
        ? "l.price_minor"
        : "l.created_at";
      const op = query.sort === "price_low" ? ">" : "<";
      clauses.push(
        `(${column},l.id) ${op} ($${params.length - 1},$${params.length})`,
      );
    }
    const result = await this.ctx.pool.query(
      `${distance ? publicSelect.replace(" FROM listing l", ", " + distance + ' AS "distanceKm" FROM listing l') : publicSelect} WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT 25 ${!query.cursor && page > 1 ? "OFFSET " + (page - 1) * 24 : ""}`,
      params,
    );
    const items = result.rows.slice(0, 24).map((item) => ({
        ...item,
        ...(item.distanceKm === undefined
          ? {}
          : { distanceKm: Math.round(item.distanceKm * 10) / 10 }),
      })),
      last = items.at(-1);
    const hasMore = result.rows.length > 24;
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              id: last.id,
              createdAt: new Date(last.createdAt).toISOString(),
              priceMinor: last.priceMinor,
              sort: query.sort || "recent",
            }),
          ).toString("base64url")
        : null;
    return { items, total: count, page, hasMore, nextCursor };
  }
  @Get("listings/mine") async mine(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return {
      items: (
        await this.ctx.pool.query(
          `${publicSelect} WHERE l.seller_id=$1 ORDER BY l.created_at DESC`,
          [user.id],
        )
      ).rows,
    };
  }
  @Get("listings/:id/edit") async editDetail(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const user = await this.ctx.user(req);
    const item = await this.detail(id, req);
    if (item.sellerId !== user.id)
      throw new NotFoundException("Listing not found.");
    const pin = (
      await this.ctx.pool.query(
        "SELECT latitude,longitude FROM listing WHERE id=$1",
        [id],
      )
    ).rows[0];
    return { ...item, ...pin };
  }
  @Get("listings/:id") async detail(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const result = await this.ctx.pool.query(`${publicSelect} WHERE l.id=$1`, [
      id,
    ]);
    const item = result.rows[0];
    if (!item) throw new NotFoundException("This listing was not found.");
    const suspended = !!(
      await this.ctx.pool.query(
        "SELECT 1 FROM user_settings WHERE user_id=$1 AND suspended",
        [item.sellerId],
      )
    ).rowCount;
    if (["removed", "archived"].includes(item.status) || suspended) {
      const session = await this.ctx.session(req);
      if (session?.user.id !== item.sellerId) {
        try {
          await this.ctx.admin(req);
        } catch {
          throw new NotFoundException("This listing is unavailable.");
        }
      }
    }
    return item;
  }
  async validateImages(
    images: string[],
    ownerId: string,
    db: Pick<import("pg").Pool, "query"> = this.ctx.pool,
  ) {
    if (new Set(images).size !== images.length)
      throw new BadRequestException("Choose different photos.");
    const result = await db.query(
      "SELECT path FROM media WHERE owner_id=$1 AND path=ANY($2::text[]) FOR KEY SHARE",
      [ownerId, images],
    );
    if (result.rowCount !== images.length)
      throw new BadRequestException("Use photos you uploaded to your account.");
  }
  @Post("listings") async create(@Req() req: Request, @Body() input: unknown) {
    const user = await this.ctx.user(req);
    const data = listingInput.parse(input);
    if (data.expectedSellerId && data.expectedSellerId !== user.id)
      throw new ForbiddenException(
        "This draft belongs to another signed-in account.",
      );
    if (user.name === "OFFERME member")
      throw new BadRequestException(
        "Choose a public display name in Account first.",
      );
    return transaction(this.ctx, async (db) => {
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [user.id]);
      const payloadHash = createHash("sha256")
        .update(
          JSON.stringify({
            ...data,
            attributes: Object.fromEntries(
              Object.entries(data.attributes).sort(([a], [b]) =>
                a.localeCompare(b),
              ),
            ),
          }),
        )
        .digest("hex");
      if (data.clientId) {
        const previous = (
          await db.query(
            "SELECT id,publish_hash FROM listing WHERE seller_id=$1 AND client_id=$2",
            [user.id, data.clientId],
          )
        ).rows[0];
        if (previous) {
          if (previous.publish_hash !== payloadHash)
            throw new BadRequestException(
              "That publication identifier was already used for a different listing.",
            );
          return { id: previous.id };
        }
      }
      await this.validateImages(data.images, user.id, db);
      const id = randomUUID();
      await db.query(
        "INSERT INTO listing(id,seller_id,title,description,defects,price_minor,category_id,condition,neighborhood,negotiable,images,client_id,subcategory,attributes,latitude,longitude,publish_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
        [
          id,
          user.id,
          data.title,
          data.description,
          data.defects,
          data.priceMinor,
          data.categoryId,
          data.condition,
          data.neighborhood,
          data.negotiable,
          JSON.stringify(data.images),
          data.clientId || null,
          data.subcategory,
          JSON.stringify(data.attributes),
          data.latitude == null ? null : Math.round(data.latitude * 100) / 100,
          data.longitude == null
            ? null
            : Math.round(data.longitude * 100) / 100,
          payloadHash,
        ],
      );
      return { id, ...data };
    });
  }
  @Patch("listings/:id") async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const data = listingInput.parse(input);
    if (data.expectedSellerId && data.expectedSellerId !== user.id)
      throw new ForbiddenException(
        "This draft belongs to another signed-in account.",
      );
    return transaction(this.ctx, async (db) => {
      const listing = await lockListing(db, id);
      if (data.latitude === undefined) data.latitude = listing.latitude;
      if (data.longitude === undefined) data.longitude = listing.longitude;
      if (listing.seller_id !== user.id)
        throw new NotFoundException("Listing not found.");
      if (["sold", "removed"].includes(listing.status))
        throw new BadRequestException("This listing can no longer be edited.");
      await this.validateImages(data.images, user.id, db);
      await db.query(
        "UPDATE listing SET title=$2,description=$3,defects=$4,price_minor=$5,category_id=$6,condition=$7,neighborhood=$8,negotiable=$9,images=$10,subcategory=$11,attributes=$12,latitude=$13,longitude=$14,updated_at=now() WHERE id=$1",
        [
          id,
          data.title,
          data.description,
          data.defects,
          data.priceMinor,
          data.categoryId,
          data.condition,
          data.neighborhood,
          data.negotiable,
          JSON.stringify(data.images),
          data.subcategory,
          JSON.stringify(data.attributes),
          data.latitude == null ? null : Math.round(data.latitude * 100) / 100,
          data.longitude == null
            ? null
            : Math.round(data.longitude * 100) / 100,
        ],
      );
      return { id, ...data };
    });
  }
  @Patch("listings/:id/status") async status(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const { status } = z
      .object({ status: z.enum(["active", "sold", "archived"]) })
      .strict()
      .parse(input);
    if (status === "sold") {
      await reportSale(this.ctx, user.id, id);
      return { id, status };
    }
    return transaction(this.ctx, async (db) => {
      const listing = await lockListing(db, id);
      if (
        listing.seller_id !== user.id ||
        ["removed", "sold"].includes(listing.status)
      )
        throw new BadRequestException(
          "This listing cannot be changed. Sold listings stay sold.",
        );
      await db.query(
        "UPDATE reservation SET status='cancelled' WHERE listing_id=$1 AND status='confirmed'",
        [id],
      );
      await setListingStatus(db, id, listing.status, status, user.id);
      return { id, status };
    });
  }

  @Post("media")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
    @Body("clientId") uploadClientId?: unknown,
    @Body("expectedOwnerId") expectedOwnerId?: unknown,
  ) {
    const user = await this.ctx.user(req);
    if (
      !file ||
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ].includes(file.mimetype)
    )
      throw new BadRequestException(
        "Choose a JPG, PNG, WebP, or supported HEIC image under 8 MB.",
      );
    if (expectedOwnerId !== undefined && expectedOwnerId !== user.id)
      throw new ForbiddenException(
        "This photo belongs to another signed-in account.",
      );
    const id = randomUUID();
    const path = `/media/${id}.webp`;
    let image: Buffer;
    try {
      image = await sharp(file.buffer, { limitInputPixels: 25_000_000 })
        .rotate()
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        "This photo could not be read. Try a JPG or PNG.",
      );
    }
    const clientId = z.string().uuid().optional().parse(uploadClientId);
    const hash = createHash("sha256").update(file.buffer).digest("hex");
    return transaction(this.ctx, async (db) => {
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [user.id]);
      if (clientId) {
        const previous = (
          await db.query(
            "SELECT id,path,thumbnail_path,upload_hash FROM media WHERE owner_id=$1 AND upload_client_id=$2",
            [user.id, clientId],
          )
        ).rows[0];
        if (previous) {
          if (previous.upload_hash !== hash)
            throw new BadRequestException(
              "That upload identifier was already used for another photo.",
            );
          return {
            id: previous.id,
            url: previous.path,
            thumbnailUrl: previous.thumbnail_path,
          };
        }
      }
      let stored:
        Awaited<ReturnType<typeof this.ctx.storage.upload>> | undefined;
      let thumbnail: typeof stored;
      try {
        stored = await this.ctx.storage.upload({
          key: `${id}.webp`,
          body: image,
          contentType: "image/webp",
        });
        const small = await sharp(image)
          .resize(400, 400, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 70 })
          .toBuffer();
        thumbnail = await this.ctx.storage.upload({
          key: `${id}.thumb.webp`,
          body: small,
          contentType: "image/webp",
        });
        await db.query(
          "INSERT INTO media(id,owner_id,path,storage,thumbnail_path,thumbnail_storage,upload_client_id,upload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            id,
            user.id,
            path,
            JSON.stringify(stored),
            `/media/${id}.thumb.webp`,
            JSON.stringify(thumbnail),
            clientId || null,
            hash,
          ],
        );
      } catch (error) {
        for (const file of [stored, thumbnail])
          if (file)
            try {
              await this.ctx.storage.remove(file);
            } catch {
              console.error("Could not clean up an unrecorded media object.");
            }
        throw error;
      }
      return { id, url: path, thumbnailUrl: `/media/${id}.thumb.webp` };
    });
  }
  @Get("favorites") async saved(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return {
      items: (
        await this.ctx.pool.query(
          `${publicSelect} JOIN favorite f ON f.listing_id=l.id WHERE f.user_id=$1 AND l.status NOT IN ('removed','archived') ORDER BY f.created_at DESC`,
          [user.id],
        )
      ).rows,
    };
  }
  @Post("favorites/:id") async save(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const user = await this.ctx.user(req);
    await this.detail(id, req);
    await this.ctx.db
      .insert(favorites)
      .values({ userId: user.id, listingId: id })
      .onConflictDoNothing();
    return { saved: true };
  }
  @Delete("favorites/:id") async unsave(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const user = await this.ctx.user(req);
    await this.ctx.db
      .delete(favorites)
      .where(and(eq(favorites.userId, user.id), eq(favorites.listingId, id)));
    return { saved: false };
  }
}
