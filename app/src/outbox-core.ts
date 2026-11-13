export type PendingMessage = {
  clientId: string;
  conversationId: string;
  userId: string;
  body: string;
  createdAt: string;
  status: "pending" | "failed";
};
export type Store = {
  getItemSync: (key: string) => string | null;
  setItemSync: (key: string, value: string) => void;
  removeItemSync: (key: string) => unknown;
  getAllKeysSync: () => string[];
};
export class DurableOutbox {
  private activeUser: string | undefined;
  private running: Promise<void> | undefined;
  private listeners = new Set<() => void>();
  private store: Store;
  private send: (m: PendingMessage) => Promise<unknown>;
  constructor(store: Store, send: (m: PendingMessage) => Promise<unknown>) {
    this.store = store;
    this.send = send;
  }
  activate(userId: string | undefined) {
    this.activeUser = userId;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.listeners.forEach((fn) => fn());
  }
  private key(m: PendingMessage) {
    return "offerme:outbox:" + m.userId + ":" + m.clientId;
  }
  list(userId: string) {
    return this.store
      .getAllKeysSync()
      .filter((k) => k.startsWith("offerme:outbox:" + userId + ":"))
      .flatMap((k) => {
        try {
          return [JSON.parse(this.store.getItemSync(k)!) as PendingMessage];
        } catch {
          return [];
        }
      })
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.clientId.localeCompare(b.clientId),
      );
  }
  enqueue(m: PendingMessage) {
    if (m.userId !== this.activeUser)
      throw new Error("Sign in to queue a message.");
    this.store.setItemSync(this.key(m), JSON.stringify(m));
    this.changed();
  }
  discard(m: PendingMessage) {
    this.store.removeItemSync(this.key(m));
    this.changed();
  }
  retry(m: PendingMessage) {
    this.store.setItemSync(
      this.key(m),
      JSON.stringify({ ...m, status: "pending" }),
    );
    this.changed();
    return this.flush();
  }
  flush() {
    if (this.running) return this.running;
    const run = async () => {
      const userId = this.activeUser;
      if (!userId) return;
      for (const m of this.list(userId)) {
        if (this.activeUser !== userId) break;
        if (m.status === "failed") continue;
        try {
          await this.send(m);
          this.store.removeItemSync(this.key(m));
          this.changed();
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status === 401) break;
          if (
            status &&
            status >= 400 &&
            status < 500 &&
            status !== 408 &&
            status !== 429
          ) {
            this.store.setItemSync(
              this.key(m),
              JSON.stringify({ ...m, status: "failed" }),
            );
            this.changed();
          } else break;
        }
      }
    };
    this.running = run().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  clear(userId: string) {
    for (const m of this.list(userId)) this.store.removeItemSync(this.key(m));
    this.changed();
  }
}
