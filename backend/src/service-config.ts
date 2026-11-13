// Read switches strictly: the string "false" must never enable a bypass.
export function booleanSetting(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
) {
  const value = env[name]?.trim().toLowerCase();
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

export function serviceConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const otpBypass = booleanSetting(
    env,
    "optbypass",
    env.NODE_ENV !== "production",
  );
  if (env.NODE_ENV === "production" && otpBypass)
    throw new Error("Production cannot enable OTP console bypass.");
  const sms = {
    bypass: otpBypass,
    token: env.AFROMESSAGE_TOKEN?.trim() || "",
    sender: env.AFROMESSAGE_SENDER?.trim() || undefined,
    from: env.AFROMESSAGE_IDENTIFIER_ID?.trim() || undefined,
  };
  if (!sms.bypass && !sms.token)
    throw new Error("AFROMESSAGE_TOKEN is required when optbypass=false.");
  const storage = {
    provider: booleanSetting(env, "AWS", false)
      ? ("s3" as const)
      : ("cloudinary" as const),
    aws: {
      region: env.AWS_REGION?.trim() || "",
      bucket: env.AWS_S3_BUCKET?.trim() || "",
    },
    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME?.trim() || "",
      apiKey: env.CLOUDINARY_API_KEY?.trim() || "",
      apiSecret: env.CLOUDINARY_API_SECRET?.trim() || "",
    },
  };
  if (
    env.NODE_ENV === "production" &&
    (storage.provider === "s3"
      ? !storage.aws.region || !storage.aws.bucket
      : !storage.cloudinary.cloudName ||
        !storage.cloudinary.apiKey ||
        !storage.cloudinary.apiSecret)
  )
    throw new Error(
      "Configure the selected production storage provider before startup.",
    );
  return { sms, storage };
}
export type SmsConfiguration = ReturnType<typeof serviceConfiguration>["sms"];
export type StorageConfiguration = ReturnType<
  typeof serviceConfiguration
>["storage"];
