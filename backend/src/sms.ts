import type { SmsConfiguration } from "./service-config.js";

export async function sendOtp(
  config: SmsConfiguration,
  phone: string,
  code: string,
) {
  if (config.bypass) {
    console.info(`[LOCAL DEVELOPMENT OTP] ${phone}: ${code}`);
    return;
  }
  // Never log codes or silently fall back when real SMS delivery fails.
  try {
    if (!config.token) throw new Error("SMS credentials missing");
    const response = await fetch("https://api.afromessage.com/api/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phone,
        sender: config.sender,
        from: config.from,
        message: `Your OFFERME code is ${code}. It expires in 5 minutes. Never share this code.`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as { acknowledge?: string };
    if (!response.ok || result?.acknowledge !== "success")
      throw new Error("SMS request rejected");
  } catch {
    throw new Error("We could not send your code. Please try again shortly.");
  }
}
