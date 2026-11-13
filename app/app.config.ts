import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const web = process.env.EXPO_PUBLIC_WEB_URL;
  const host = web ? new URL(web).hostname : undefined;
  const projectId = process.env.EAS_PROJECT_ID;
  if (process.env.EAS_BUILD_PROFILE === "production" && !projectId)
    throw new Error("Production builds require EAS_PROJECT_ID.");
  if (
    process.env.EAS_BUILD_PROFILE === "production" &&
    (!web?.startsWith("https://") ||
      !process.env.EXPO_PUBLIC_API_URL?.startsWith("https://"))
  )
    throw new Error(
      "Production builds require HTTPS EXPO_PUBLIC_WEB_URL and EXPO_PUBLIC_API_URL.",
    );
  return {
    ...config,
    name: "OFFERME",
    slug: "offerme",
    icon: "./assets/icon.png",
    ios: {
      ...config.ios,
      ...(host ? { associatedDomains: ["applinks:" + host] } : {}),
    },
    android: {
      ...config.android,
      ...(host
        ? {
            intentFilters: [
              {
                action: "VIEW",
                autoVerify: true,
                data: [{ scheme: "https", host, pathPrefix: "/items" }],
                category: ["BROWSABLE", "DEFAULT"],
              },
            ],
          }
        : {}),
    },
    plugins: [
      ...(config.plugins || []),
      "expo-notifications",
      "expo-sharing",
      "expo-status-bar",
      "expo-web-browser",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "OFFERME uses your approximate location only when you choose nearby search or add a listing pin.",
        },
      ],
    ],
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
