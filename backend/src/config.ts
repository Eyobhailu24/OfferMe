import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { booleanSetting, serviceConfiguration } from "./service-config.js";

export function configuration() {
  const production = process.env.NODE_ENV === "production";
  const local = resolve(".local");
  let databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl &&
    !production &&
    existsSync(resolve(local, "database.json"))
  ) {
    const db = JSON.parse(
      readFileSync(resolve(local, "database.json"), "utf8"),
    );
    databaseUrl = `postgresql://${db.user}:${encodeURIComponent(db.password)}@${db.host}:${db.port}/${db.database}`;
  }
  if (!databaseUrl)
    throw new Error(
      "DATABASE_URL is required. For local development, run npm run db:local.",
    );
  let secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && !production) {
    mkdirSync(local, { recursive: true });
    const path = resolve(local, "auth-secret");
    if (!existsSync(path))
      writeFileSync(path, randomBytes(48).toString("hex"), { mode: 0o600 });
    secret = readFileSync(path, "utf8");
  }
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (production && (!process.env.WEB_ORIGIN || !process.env.BETTER_AUTH_URL))
    throw new Error("Production requires WEB_ORIGIN and BETTER_AUTH_URL.");
  if (
    production &&
    (!process.env.WEB_ORIGIN?.startsWith("https://") ||
      !process.env.BETTER_AUTH_URL?.startsWith("https://"))
  )
    throw new Error("Production origins must use HTTPS.");
  const adminPhones = (process.env.ADMIN_PHONES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminPhones.some((phone) => !/^\+251[79]\d{8}$/.test(phone)))
    throw new Error(
      "ADMIN_PHONES must contain normalized Ethiopian mobile numbers.",
    );
  let adminTotpSecrets: Record<string, string> = {};
  try {
    adminTotpSecrets = JSON.parse(process.env.ADMIN_TOTP_SECRETS || "{}");
    if (
      !adminTotpSecrets ||
      typeof adminTotpSecrets !== "object" ||
      Array.isArray(adminTotpSecrets) ||
      Object.values(adminTotpSecrets).some(
        (v) => typeof v !== "string" || !/^([A-Z2-7]{32,})$/.test(v),
      )
    )
      throw new Error();
  } catch {
    throw new Error(
      "ADMIN_TOTP_SECRETS must map administrator phone numbers to base32 secrets of at least 32 characters.",
    );
  }
  if (production && adminPhones.some((phone) => !adminTotpSecrets[phone]))
    throw new Error("Every production administrator requires a TOTP secret.");
  return {
    production,
    databaseUrl,
    secret,
    ...serviceConfiguration(),
    postgisEnabled: booleanSetting(process.env, "POSTGIS_ENABLED", false),
    expoPushEnabled: booleanSetting(process.env, "EXPO_PUSH_ENABLED", false),
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN || "",
    port: Number(process.env.PORT || 4100),
    host: process.env.HOST || "127.0.0.1",
    webOrigin: process.env.WEB_ORIGIN || "http://127.0.0.1:3100",
    authUrl: process.env.BETTER_AUTH_URL || "http://127.0.0.1:4100",
    uploadDir: resolve(local, "uploads"),
    adminPhones,
    adminTotpSecrets,
    trustedProxyIps: (process.env.TRUSTED_PROXY_IPS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
export type Configuration = ReturnType<typeof configuration>;
