import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const listings = pgTable(
  "listing",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    defects: text("defects").notNull(),
    priceMinor: integer("price_minor").notNull(),
    categoryId: text("category_id").notNull(),
    condition: text("condition").notNull(),
    neighborhood: text("neighborhood").notNull(),
    negotiable: boolean("negotiable").notNull().default(true),
    status: text("status").notNull().default("active"),
    images: jsonb("images").$type<string[]>().notNull(),
    demo: boolean("demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("listing_feed_idx").on(t.status, t.createdAt),
    index("listing_category_idx").on(t.categoryId),
  ],
);

export const favorites = pgTable(
  "favorite",
  {
    userId: text("user_id").notNull(),
    listingId: text("listing_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("favorite_unique").on(t.userId, t.listingId)],
);

export const conversations = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull(),
    buyerId: text("buyer_id").notNull(),
    sellerId: text("seller_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("conversation_unique").on(t.listingId, t.buyerId)],
);

export const messages = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    senderId: text("sender_id").notNull(),
    clientId: text("client_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("message_idempotency").on(t.senderId, t.clientId),
    index("message_thread").on(t.conversationId, t.createdAt),
  ],
);
