import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "./api";
import { storage } from "./persistence";
export async function registerPush() {
  if (!Device.isDevice || Constants.executionEnvironment === "storeClient")
    throw new Error(
      "Notifications require an installed development or release build on a physical device.",
    );
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId)
    throw new Error(
      "Set the EAS project ID before enabling push notifications.",
    );
  const Notifications = await import("expo-notifications");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("marketplace", {
      name: "OFFERME",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted")
    permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error("Notification permission was not granted.");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api("/v1/me/devices", "POST", { token });
  storage.setItemSync("offerme:push-token", token);
  return token;
}
export async function unregisterPush() {
  const token = storage.getItemSync("offerme:push-token");
  if (token) {
    await api("/v1/me/devices", "DELETE", { token });
    storage.removeItemSync("offerme:push-token");
  }
}
