import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/messages",
        "/saved",
        "/sell",
        "/signin",
        "/api/",
        "/v1/",
      ],
    },
  };
}
