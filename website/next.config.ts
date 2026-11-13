import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
const backend = process.env.API_URL || "http://127.0.0.1:4100";
const root = fileURLToPath(new URL(".", import.meta.url));
const config: NextConfig = {
  output: "standalone",
  turbopack: { root },
  outputFileTracingRoot: root,
  async rewrites() {
    return ["/v1/:path*", "/api/auth/:path*", "/media/:path*"].map(
      (source) => ({ source, destination: backend + source }),
    );
  },
};
export default config;
