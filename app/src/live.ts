import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { API_URL, auth } from "./api";
export function useLive(userId?: string) {
  const cache = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let socket: Socket | undefined;
    let cancelled = false;
    void auth
      .getCookie()
      .then((cookie) => {
        if (cancelled) return;
        socket = io(API_URL, { auth: { cookie }, transports: ["websocket"] });
        socket.on("conversation.updated", () => {
          void cache.invalidateQueries({ queryKey: ["conversations"] });
          void cache.invalidateQueries({ queryKey: ["thread"] });
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [userId, cache]);
}
