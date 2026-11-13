import { currentSessionFingerprint, verifiedProfileFingerprint } from "./api";
import type { User } from "../types";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { AppState, Text } from "react-native";
import * as Network from "expo-network";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { storage } from "./persistence";
import { outbox } from "./outbox";
import { useLocale, useUser } from "./provider";
const publicKey = (key: readonly unknown[]) =>
  ["catalog", "listings", "listing"].includes(String(key[0]));
export function LocalSync() {
  const user = useUser();
  const { t } = useLocale();
  const client = useQueryClient();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync("offerme-profile-cache")
      .then(async (raw) => {
        if (!active || !raw) return;
        try {
          const saved = JSON.parse(raw);
          const fingerprint = await currentSessionFingerprint();
          if (!active || !fingerprint || fingerprint !== saved.fingerprint)
            return;
          if (
            saved.validatedAt > Date.now() - 14 * 86400000 &&
            client.getQueryState(["me"])?.status !== "success"
          )
            client.setQueryData(
              ["me"],
              { ...saved.user, admin: false, adminVerified: false },
              { updatedAt: 0 },
            );
        } catch {}
      })
      .catch(() => {});
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        event.query.queryKey[0] !== "me" ||
        event.type !== "updated" ||
        event.query.state.status !== "success" ||
        !event.query.state.dataUpdatedAt
      )
        return;
      const data = event.query.state.data as User | null;
      if (data)
        void verifiedProfileFingerprint(data.id)
          .then((fingerprint) => {
            if (active && fingerprint)
              return SecureStore.setItemAsync(
                "offerme-profile-cache",
                JSON.stringify({
                  user: data,
                  validatedAt: event.query.state.dataUpdatedAt,
                  fingerprint,
                }),
              );
          })
          .catch(() => {});
      else
        void SecureStore.deleteItemAsync("offerme-profile-cache").catch(
          () => {},
        );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    try {
      const raw = storage.getItemSync("offerme:public-cache");
      if (raw) {
        const items = JSON.parse(raw) as {
          key: unknown[];
          data: unknown;
          updatedAt: number;
        }[];
        for (const item of items)
          if (publicKey(item.key))
            client.setQueryData(item.key, item.data, {
              updatedAt: item.updatedAt,
            });
      }
    } catch {}
    const save = () => {
      try {
        const items = client
          .getQueryCache()
          .getAll()
          .filter((q) => publicKey(q.queryKey) && q.state.data !== undefined)
          .slice(-100)
          .map((q) => ({
            key: q.queryKey,
            data: q.state.data,
            updatedAt: q.state.dataUpdatedAt,
          }));
        storage.setItemSync("offerme:public-cache", JSON.stringify(items));
      } catch {}
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = client.getQueryCache().subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(save, 500);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
      save();
    };
  }, [client]);
  useEffect(() => {
    outbox.activate(user.dataUpdatedAt ? user.data?.id : undefined);
    const flush = () => {
      if (AppState.currentState === "active")
        void outbox.flush().then(() => {
          void client.invalidateQueries({ queryKey: ["thread"] });
          void client.invalidateQueries({ queryKey: ["conversations"] });
        });
    };
    const update = (state: Network.NetworkState) => {
      const connected =
        state.isConnected !== false && state.isInternetReachable !== false;
      setOffline(!connected);
      onlineManager.setOnline(connected);
      if (connected) flush();
    };
    void Network.getNetworkStateAsync()
      .then(update)
      .catch(() => {});
    const network = Network.addNetworkStateListener(update);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") flush();
    });
    const timer = setInterval(flush, 8000);
    return () => {
      clearInterval(timer);
      network.remove();
      app.remove();
      outbox.activate(undefined);
    };
  }, [user.data?.id, user.dataUpdatedAt, client]);
  return offline ? (
    <Text
      accessibilityRole="alert"
      style={{ padding: 12, backgroundColor: "#fff2d6", color: "#4d3d13" }}
    >
      {t("offline")}
    </Text>
  ) : null;
}
