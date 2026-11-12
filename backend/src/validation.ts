import { z } from 'zod';
import { categories, conditions, neighborhoods } from './catalog.js';

export const listingInput = z.object({
  title: z.string().trim().min(4).max(100), description: z.string().trim().min(15).max(4000),
  defects: z.string().trim().min(2).max(1000), priceMinor: z.number().int().min(0).max(2_000_000_000),
  categoryId: z.string().refine(s => categories.some(c => c.id === s), 'Choose a supported category'),
  condition: z.enum(conditions), neighborhood: z.enum(neighborhoods), negotiable: z.boolean(),
  images: z.array(z.string().regex(/^\/media\/[a-f0-9-]+\.webp$/)).min(1).max(12),
}).strict();
export const messageInput = z.object({ body: z.string().trim().min(1).max(2000), clientId: z.string().uuid() }).strict();
export const profileInput = z.object({ name: z.string().trim().min(2).max(50).refine(s => !/\+?\d[\d\s-]{7,}/.test(s), 'Use a display name, not a phone number') }).strict();
export function normalizePhone(raw: string) {
  const input = raw.replace(/[\s()-]/g, '');
  const phone = input.startsWith('0') ? '+251' + input.slice(1) : input.startsWith('251') ? '+' + input : input;
  if (!/^\+251[79]\d{8}$/.test(phone)) throw new Error('Enter a valid Ethiopian mobile number');
  return phone;
}
