"use client";
import { useEffect, useState } from "react";
import { useQueryClient, onlineManager } from "@tanstack/react-query";
import { outbox } from "@/lib/outbox";
import { useLocale, useUser } from "./provider";
export function LocalSync() {
  const user = useUser();
  const { t } = useLocale();
  const client = useQueryClient();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    outbox.activate(user.data?.id);
    const flush = () => {
      if (document.visibilityState === "visible")
        void outbox.flush().then(() => {
          void client.invalidateQueries({ queryKey: ["thread"] });
          void client.invalidateQueries({ queryKey: ["conversations"] });
        });
    };
    const update = () => {
      setOffline(!navigator.onLine);
      onlineManager.setOnline(navigator.onLine);
      if (navigator.onLine) flush();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    document.addEventListener("visibilitychange", flush);
    const timer = setInterval(flush, 8000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      document.removeEventListener("visibilitychange", flush);
      outbox.activate(undefined);
    };
  }, [user.data?.id, client]);
  return offline ? <p role="alert">{t("offline")}</p> : null;
}
