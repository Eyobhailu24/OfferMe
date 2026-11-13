import { useEffect, useState } from "react";
import { DurableOutbox, type PendingMessage } from "./outbox-core";
import { storage } from "./persistence";
import { api } from "./api";
export const outbox = new DurableOutbox(storage, (m) =>
  api("/v1/conversations/" + m.conversationId + "/messages", "POST", {
    clientId: m.clientId,
    body: m.body,
    expectedSenderId: m.userId,
  }),
);
export function useOutbox(userId: string | undefined, conversationId: string) {
  const [items, setItems] = useState<PendingMessage[]>([]);
  useEffect(() => {
    const refresh = () =>
      setItems(
        userId
          ? outbox
              .list(userId)
              .filter((m) => m.conversationId === conversationId)
          : [],
      );
    refresh();
    return outbox.subscribe(refresh);
  }, [userId, conversationId]);
  return items;
}
