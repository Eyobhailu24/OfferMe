import { z } from "zod";
import type { OpenAPIObject } from "@nestjs/swagger";
import { listingInput, profileInput, messageInput } from "./validation.js";
const id = z.string(),
  stamp = z.string(),
  string = z.string(),
  bool = z.boolean(),
  integer = z.number().int();
const Listing = z.object({
  id,
  sellerId: id,
  title: string,
  description: string,
  defects: string,
  priceMinor: integer,
  categoryId: string,
  subcategory: string.nullable(),
  attributes: z.record(string, string),
  condition: string,
  neighborhood: string,
  negotiable: bool,
  status: string,
  images: z.array(string),
  distanceKm: z.number().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  sellerName: string,
  sellerSince: stamp,
  sellerPhoneVerified: bool.nullable(),
  demo: bool,
  createdAt: stamp,
});
const Category = z.object({
  id,
  name: string,
  am: string,
  om: string,
  icon: string,
  subcategories: z.array(string),
  fields: z.array(z.object({ id, options: z.array(string).optional() })),
});
const Conversation = z.object({
  id,
  listingId: id,
  buyerId: id,
  sellerId: id,
  otherId: id,
  otherName: string,
  title: string,
  images: z.array(string),
  lastMessage: string.nullable(),
  priceMinor: integer,
  unreadCount: integer,
  updatedAt: stamp,
});
const Message = z.object({
  id,
  senderId: id,
  body: string,
  clientId: id,
  createdAt: stamp,
});
const Offer = z.object({
  id,
  senderId: id,
  amountMinor: integer,
  status: string,
  expiresAt: stamp,
  previousId: id.nullable(),
  createdAt: stamp,
});
const Meetup = z.object({
  id,
  proposerId: id,
  place: string,
  neighborhood: string.nullable(),
  scheduledAt: stamp,
  status: string,
  previousId: id.nullable(),
});
const Thread = z.object({
  id,
  buyerId: id,
  sellerId: id,
  listingId: id,
  blocked: bool,
  hasEarlier: bool,
  listingStatus: string,
  reservation: z.object({ id, buyerId: id, expiresAt: stamp }).nullable(),
  muted: bool,
  readCursors: z.array(z.object({ userId: id, messageId: id })),
  messages: z.array(Message),
  offers: z.array(Offer),
  meetups: z.array(Meetup),
});
const Sale = z.object({
  id,
  listing_id: id,
  title: string,
  seller_id: id,
  buyer_id: id.nullable(),
  seller_confirmed: bool,
  buyer_confirmed: bool,
  reviewed: bool,
  other_name: string.nullable(),
  created_at: stamp,
  conversation_id: id.nullable(),
});
const Review = z.object({
  id,
  rating: integer,
  body: string,
  authorName: string,
  authorId: id,
  createdAt: stamp,
});
const filters = z.object({
  q: string.optional(),
  category: string.optional(),
  neighborhood: string.optional(),
  condition: string.optional(),
  min: integer.optional(),
  max: integer.optional(),
});
const Support = z.object({
  id,
  kind: string,
  body: string,
  status: string,
  response: string.nullable(),
  created_at: stamp,
});
export const responseSchemas = {
  Listing,
  Category,
  Conversation,
  Message,
  Thread,
  Sale,
  User: z.object({
    id,
    name: string,
    phoneNumber: string,
    phoneNumberVerified: bool,
    createdAt: stamp,
    admin: bool,
    adminMfaRequired: bool,
    adminVerified: bool,
  }),
  Catalog: z.object({
    categories: z.array(Category),
    neighborhoods: z.array(string),
    conditions: z.array(string),
    currency: z.literal("ETB"),
    city: z.literal("Addis Ababa"),
  }),
  Page: z.object({
    items: z.array(Listing),
    total: integer,
    page: integer,
    hasMore: bool,
    nextCursor: string.nullable(),
  }),
  Listings: z.object({ items: z.array(Listing) }),
  Conversations: z.object({ items: z.array(Conversation) }),
  Sales: z.object({ items: z.array(Sale) }),
  Reputation: z.object({
    id,
    name: string,
    createdAt: stamp,
    phoneVerified: bool.nullable(),
    count: integer,
    rating: z.number().nullable(),
    reviews: z.array(Review),
  }),
  Offer,
  Meetup,
  Id: z.object({ id }),
  Status: z.object({ id, status: string }),
  Profile: z.object({ id, name: string }),
  Media: z.object({ id, url: string }),
  Settings: z.object({
    locale: z.enum(["en", "am", "om"]),
    pushEnabled: bool,
    suspended: bool.optional(),
    deletionRequestedAt: stamp.nullable().optional(),
  }),
  Reservation: z.object({
    id,
    listing_id: id,
    conversation_id: id,
    buyer_id: id,
    seller_id: id,
    expires_at: stamp,
    status: string,
    created_at: stamp,
  }),
  SaleRecord: z.object({
    id,
    listing_id: id,
    seller_id: id,
    buyer_id: id.nullable(),
    conversation_id: id.nullable(),
    seller_confirmed: bool,
    buyer_confirmed: bool,
    created_at: stamp,
  }),
  ReviewRecord: z.object({
    hidden: bool,
    id,
    sale_id: id,
    author_id: id,
    subject_id: id,
    rating: integer,
    body: string,
    created_at: stamp,
  }),
  SavedSearch: z.object({ id, name: string, filters }),
  Searches: z.object({
    items: z.array(z.object({ id, name: string, filters })),
  }),
  Blocks: z.object({ items: z.array(z.object({ id, name: string })) }),
  Support,
  SupportList: z.object({ items: z.array(Support) }),
  Reports: z.object({
    items: z.array(
      z.object({
        id,
        listingId: id.nullable(),
        userId: id.nullable(),
        reason: string,
        status: string,
        createdAt: stamp,
        listingStatus: string.nullable(),
      }),
    ),
  }),
  Success: z.record(string, z.unknown()),
  Error: z.object({ message: string, statusCode: integer.optional() }),
};
export function completeContracts(document: OpenAPIObject) {
  document.openapi = "3.1.0";
  document.components ||= {};
  document.components.schemas ||= {};
  const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
  for (const [name, schema] of Object.entries(responseSchemas)) {
    const json = z.toJSONSchema(schema);
    delete json.$schema;
    document.components.schemas[name] = json as never;
  }
  const settings = z.object({
    locale: z.enum(["en", "am", "om"]),
    pushEnabled: bool,
  });
  const routes: [string, string, keyof typeof responseSchemas, z.ZodType?][] = [
    ["get", "/v1/ready", "Success"],
    ["get", "/v1/admin/health", "Success"],
    ["post", "/v1/admin/jobs/{id}/retry", "Success"],
    ["patch", "/v1/admin/listings/{id}/restore", "Status"],
    ["get", "/v1/me", "User"],
    ["patch", "/v1/me", "Profile", profileInput],
    ["get", "/v1/catalog", "Catalog"],
    ["get", "/v1/health", "Success"],
    ["get", "/v1/listings", "Page"],
    ["post", "/v1/listings", "Id", listingInput],
    ["get", "/v1/listings/mine", "Listings"],
    ["get", "/v1/listings/{id}/edit", "Listing"],
    ["get", "/v1/listings/{id}", "Listing"],
    ["patch", "/v1/listings/{id}", "Id", listingInput],
    [
      "patch",
      "/v1/listings/{id}/status",
      "Status",
      z.object({ status: z.enum(["active", "sold", "archived"]) }),
    ],
    ["post", "/v1/media", "Media"],
    ["get", "/v1/favorites", "Listings"],
    ["post", "/v1/favorites/{id}", "Success"],
    ["delete", "/v1/favorites/{id}", "Success"],
    ["get", "/v1/conversations", "Conversations"],
    ["post", "/v1/conversations", "Id", z.object({ listingId: id })],
    ["get", "/v1/conversations/{id}", "Thread"],
    ["post", "/v1/conversations/{id}/messages", "Message", messageInput],
    [
      "post",
      "/v1/conversations/{id}/offers",
      "Status",
      z.object({ amountMinor: integer, previousId: id.optional() }),
    ],
    [
      "patch",
      "/v1/conversations/{id}/offers/{offerId}",
      "Status",
      z.object({ status: z.enum(["accepted", "declined", "withdrawn"]) }),
    ],
    [
      "post",
      "/v1/conversations/{id}/meetups",
      "Status",
      z.object({
        place: string,
        scheduledAt: stamp,
        previousId: id.optional(),
      }),
    ],
    [
      "patch",
      "/v1/conversations/{id}/meetups/{meetupId}",
      "Status",
      z.object({
        status: z.enum([
          "confirmed",
          "cancelled",
          "completed",
          "no_show_reported",
        ]),
      }),
    ],
    [
      "patch",
      "/v1/conversations/{id}/read",
      "Success",
      z.object({ messageId: id }),
    ],
    [
      "patch",
      "/v1/conversations/{id}/mute",
      "Success",
      z.object({ muted: bool }),
    ],
    [
      "post",
      "/v1/listings/{id}/reservations",
      "Reservation",
      z.object({ conversationId: id, expiresAt: stamp }),
    ],
    [
      "post",
      "/v1/listings/{id}/sales",
      "SaleRecord",
      z.object({ conversationId: id.optional() }),
    ],
    ["get", "/v1/sales", "Sales"],
    ["patch", "/v1/sales/{id}/confirm", "Success"],
    [
      "post",
      "/v1/sales/{id}/reviews",
      "ReviewRecord",
      z.object({ rating: integer, body: string }),
    ],
    ["get", "/v1/users/{id}/reputation", "Reputation"],
    [
      "post",
      "/v1/me/admin-verification",
      "Success",
      z.object({ code: string }),
    ],
    ["get", "/v1/me/settings", "Settings"],
    ["patch", "/v1/me/settings", "Settings", settings],
    ["post", "/v1/me/devices", "Success", z.object({ token: string })],
    ["delete", "/v1/me/devices", "Success", z.object({ token: string })],
    ["get", "/v1/blocks", "Blocks"],
    ["post", "/v1/blocks/{id}", "Success"],
    ["delete", "/v1/blocks/{id}", "Success"],
    ["get", "/v1/saved-searches", "Searches"],
    [
      "post",
      "/v1/saved-searches",
      "SavedSearch",
      z.object({ name: string, filters }),
    ],
    ["delete", "/v1/saved-searches/{id}", "Success"],
    ["get", "/v1/support", "SupportList"],
    [
      "post",
      "/v1/support",
      "Status",
      z.object({
        kind: z.enum(["support", "recovery", "appeal"]),
        body: string,
      }),
    ],
    ["get", "/v1/me/export", "Success"],
    ["post", "/v1/me/deletion", "Status"],
    [
      "post",
      "/v1/reports",
      "Status",
      z.object({
        listingId: id.optional(),
        userId: id.optional(),
        reason: string,
        messageId: id.optional(),
        reviewId: id.optional(),
      }),
    ],
    ["get", "/v1/admin/reports", "Reports"],
    [
      "patch",
      "/v1/admin/reviews/{id}",
      "Success",
      z.object({ hidden: bool, reason: string }),
    ],
    ["get", "/v1/admin/reports/{id}", "Success"],
    [
      "patch",
      "/v1/admin/reports/{id}",
      "Status",
      z.object({ status: z.enum(["resolved", "dismissed"]) }),
    ],
    ["patch", "/v1/admin/listings/{id}", "Status"],
    ["get", "/v1/admin/support", "SupportList"],
    [
      "patch",
      "/v1/admin/support/{id}",
      "Status",
      z.object({ status: z.enum(["resolved", "dismissed"]), response: string }),
    ],
    [
      "patch",
      "/v1/admin/users/{id}",
      "Success",
      z.object({ suspended: bool, reason: string }),
    ],
  ];
  for (const [method, path, response, body] of routes) {
    const operation = (
      document.paths[path] as Record<string, any> | undefined
    )?.[method];
    if (!operation)
      throw new Error(
        "Contract refers to a missing route: " + method + " " + path,
      );
    operation.responses = {
      [method === "post" ? "201" : "200"]: {
        description: "Success",
        content: { "application/json": { schema: ref(response) } },
      },
      ...Object.fromEntries(
        ["400", "401", "403", "404", "429", "500", "503"].map((code) => [
          code,
          {
            description: "Request failed",
            content: { "application/json": { schema: ref("Error") } },
          },
        ]),
      ),
    };
    if (body) {
      const schema = z.toJSONSchema(body);
      delete schema.$schema;
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema } },
      };
    }
  }
  document.paths["/v1/media"]!.post!.requestBody = {
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          required: ["file"],
          properties: {
            file: { type: "string", format: "binary" },
            clientId: { type: "string", format: "uuid" },
            expectedOwnerId: { type: "string" },
          },
        },
      },
    },
  };
  return document;
}
