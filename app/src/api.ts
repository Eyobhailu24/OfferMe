import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:4100"
    : "http://127.0.0.1:4100");
export const auth = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { timeout: 15000 },
  plugins: [
    phoneNumberClient(),
    expoClient({
      scheme: "offerme",
      storagePrefix: "offerme",
      storage: SecureStore,
    }),
  ],
});
let verifiedProfile: { id: string; cookie: string } | undefined;
export async function currentSessionFingerprint() {
  const cookie = await auth.getCookie();
  return cookie
    ? Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, cookie)
    : null;
}
export async function verifiedProfileFingerprint(userId: string) {
  return verifiedProfile?.id === userId && verifiedProfile.cookie
    ? Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        verifiedProfile.cookie,
      )
    : null;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const cookie = await auth.getCookie();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    body instanceof FormData ? 120000 : 15000,
  );
  try {
    const response = await fetch(API_URL + path, {
      signal: controller.signal,
      method,
      credentials: "omit",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        Origin: "offerme://",
        ...(body !== undefined && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ApiError(
        data.message || "Could not connect. Please try again.",
        response.status,
      );
    if (path === "/v1/me" && typeof data.id === "string" && cookie)
      verifiedProfile = { id: data.id, cookie };
    return data as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "The connection timed out. Check your connection and try again.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export const imageUrl = (path: string) => API_URL + path;
export const money = (minor: number) =>
  new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 }).format(
    minor / 100,
  ) + " Br";
export function phoneNumber(raw: string) {
  const s = raw.replace(/[\s()-]/g, "");
  const phone = s.startsWith("0")
    ? "+251" + s.slice(1)
    : s.startsWith("251")
      ? "+" + s
      : s;
  if (!/^\+251[79]\d{8}$/.test(phone))
    throw new Error("Enter a valid Ethiopian mobile number.");
  return phone;
}

export function parsePrice(raw: string) {
  const value = raw.trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a valid price with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (minor > 2_000_000_000) throw new Error("The price is too high.");
  return minor;
}
