import { cache } from "react";
import type { Listing } from "./types";
export const siteUrl = process.env.SITE_URL || "http://127.0.0.1:3100";
export const getListing = cache(
  async (id: string, cookie = ""): Promise<Listing | null> => {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const response = await fetch(
      (process.env.API_URL || "http://127.0.0.1:4100") +
        "/v1/listings/" +
        encodeURIComponent(id),
      {
        headers: cookie ? { cookie } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error("This listing is temporarily unavailable.");
    return response.json() as Promise<Listing>;
  },
);
