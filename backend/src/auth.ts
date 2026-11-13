import { betterAuth } from "better-auth";
import { phoneNumber } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { createHash } from "node:crypto";
import type pg from "pg";
import type { Configuration } from "./config.js";
import { sendOtp } from "./sms.js";

export function createAuth(
  pool: pg.Pool,
  config: Configuration,
  onOtp?: (phone: string, code: string) => void,
) {
  return betterAuth({
    appName: "OFFERME",
    baseURL: config.authUrl,
    basePath: "/api/auth",
    secret: config.secret,
    database: pool,
    advanced: { ipAddress: { ipAddressHeaders: ["x-offerme-client-ip"] } },
    trustedOrigins: [
      config.webOrigin,
      "offerme://",
      ...(!config.production ? ["exp://*/*", "http://localhost:3100"] : []),
    ],
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/phone-number/send-otp": { window: 60, max: 3 },
        "/phone-number/verify": { window: 60, max: 6 },
      },
    },
    plugins: [
      expo(),
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        requireVerification: true,
        phoneNumberValidator: (phone) => /^\+251[79]\d{8}$/.test(phone),
        signUpOnVerification: {
          getTempEmail: (phone) =>
            `${createHash("sha256").update(phone).digest("hex")}@phone.offerme.invalid`,
          getTempName: () => "OFFERME member",
        },
        sendOTP: async ({ phoneNumber: phone, code }) => {
          if (onOtp) {
            onOtp(phone, code);
            return;
          }
          await sendOtp(config.sms, phone, code);
        },
      }),
    ],
  });
}
export type Auth = ReturnType<typeof createAuth>;
