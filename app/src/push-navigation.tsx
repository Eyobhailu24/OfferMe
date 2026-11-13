import { useEffect } from "react";
import Constants from "expo-constants";
import { router } from "expo-router";
export function PushNavigation() {
  useEffect(() => {
    if (Constants.executionEnvironment === "storeClient") return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    void import("expo-notifications")
      .then(async (n) => {
        const open = (
          response: import("expo-notifications").NotificationResponse | null,
        ) => {
          const id =
            response?.notification.request.content.data?.conversationId;
          if (active && typeof id === "string" && /^[0-9a-f-]{36}$/.test(id))
            router.push("/chat/" + id);
        };
        subscription = n.addNotificationResponseReceivedListener(open);
        open(await n.getLastNotificationResponseAsync());
        if (!active) subscription.remove();
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  return null;
}
