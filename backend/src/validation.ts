import { z } from "zod";
import { categoryRules } from "./category-rules.js";
import { categories, conditions, neighborhoods } from "./catalog.js";

export const listingInput = z
  .object({
    subcategory: z.string().max(80),
    attributes: z
      .record(z.string().max(60), z.string().trim().max(250))
      .default({}),
    latitude: z.number().min(8.8).max(9.15).nullable().optional(),
    longitude: z.number().min(38.6).max(39.0).nullable().optional(),
    clientId: z.string().uuid().optional(),
    expectedSellerId: z.string().max(100).optional(),
    title: z.string().trim().min(4).max(100),
    description: z.string().trim().min(15).max(4000),
    defects: z.string().trim().min(2).max(1000),
    priceMinor: z.number().int().min(0).max(2_000_000_000),
    categoryId: z
      .string()
      .refine(
        (s) => categories.some((c) => c.id === s),
        "Choose a supported category",
      ),
    condition: z.enum(conditions),
    neighborhood: z.enum(neighborhoods),
    negotiable: z.boolean(),
    images: z
      .array(z.string().regex(/^\/media\/[a-f0-9-]+\.webp$/))
      .min(1)
      .max(12),
  })
  .strict()
  .superRefine((data, ctx) => {
    const rule = categoryRules[data.categoryId];
    if (!rule) return;
    if (!data.subcategory || !rule.subcategories.includes(data.subcategory))
      ctx.addIssue({
        code: "custom",
        path: ["subcategory"],
        message: "Choose a supported subcategory",
      });
    for (const field of rule.fields) {
      const value = data.attributes[field.id];
      if (!value?.trim() || (field.options && !field.options.includes(value)))
        ctx.addIssue({
          code: "custom",
          path: ["attributes", field.id],
          message: "Complete this category detail",
        });
    }
    if (
      Object.keys(data.attributes).some(
        (key) => !rule.fields.some((f) => f.id === key),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["attributes"],
        message: "Unsupported category detail",
      });
    if (
      (data.latitude === undefined) !== (data.longitude === undefined) ||
      (data.latitude === null) !== (data.longitude === null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Choose both location coordinates",
      });
  });
export const messageInput = z
  .object({
    body: z.string().trim().min(1).max(2000),
    clientId: z.string().uuid(),
    expectedSenderId: z.string().max(100).optional(),
  })
  .strict();
export const profileInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .refine(
        (s) => !/\+?\d[\d\s-]{7,}/.test(s),
        "Use a display name, not a phone number",
      ),
  })
  .strict();
export function normalizePhone(raw: string) {
  const input = raw.replace(/[\s()-]/g, "");
  const phone = input.startsWith("0")
    ? "+251" + input.slice(1)
    : input.startsWith("251")
      ? "+" + input
      : input;
  if (!/^\+251[79]\d{8}$/.test(phone))
    throw new Error("Enter a valid Ethiopian mobile number");
  return phone;
}
