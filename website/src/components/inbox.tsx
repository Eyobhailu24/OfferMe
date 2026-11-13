"use client";
import { ReportControl } from "./report-control";

import { outbox, useOutbox } from "@/lib/outbox";

import { TradeActions } from "./exchanges";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { MessageCircle, Send, CalendarDays } from "lucide-react";
import { api, money, parsePrice } from "@/lib/api";
import type { Conversation, Thread } from "@/lib/types";
import { useLocale, useUser } from "./provider";
import { AuthGate, Empty, ErrorBox, Loading } from "./ui";
export function Inbox({ id }: { id?: string }) {
  const { t } = useLocale();
  const user = useUser();
  const cache = useQueryClient();
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ items: Conversation[] }>("/v1/conversations"),
    enabled: !!user.data,
    refetchInterval: 15000,
  });
  useEffect(() => {
    if (!user.data) return;
    const socket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://127.0.0.1:4100",
      { withCredentials: true },
    );
    socket.on("connect", () => {
      void cache.invalidateQueries({ queryKey: ["thread"] });
      void cache.invalidateQueries({ queryKey: ["conversations"] });
    });
    socket.on("conversation.updated", () => {
      void cache.invalidateQueries({ queryKey: ["conversations"] });
      void cache.invalidateQueries({ queryKey: ["thread"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [user.data?.id, cache]);
  return (
    <AuthGate>
      <div className="page">
        <h1>{t("messages")}</h1>
        <div className="inbox">
          <aside className="conversation-list">
            {conversations.isPending ? (
              <Loading />
            ) : conversations.error ? (
              <ErrorBox
                error={conversations.error}
                retry={() => conversations.refetch()}
              />
            ) : !conversations.data.items.length ? (
              <p>{t("selectChat")}</p>
            ) : (
              conversations.data.items.map((c) => (
                <Link
                  key={c.id}
                  href={"/messages/" + c.id}
                  className={c.id === id ? "current" : ""}
                >
                  <img src={c.images[0]} alt="" />
                  <div>
                    <strong>{c.otherName}</strong>
                    <span>{c.title}</span>
                    <small>{c.lastMessage || t("message")}</small>
                    {c.unreadCount > 0 && (
                      <small>
                        {t("unread")}: {c.unreadCount}
                      </small>
                    )}
                  </div>
                </Link>
              ))
            )}
          </aside>
          {id ? (
            <Chat
              key={id}
              id={id}
              conversation={conversations.data?.items.find((c) => c.id === id)}
            />
          ) : (
            <div className="chat-placeholder">
              <MessageCircle size={44} strokeWidth={1} />
              <h2>{t("selectChat")}</h2>
              <p>{t("safety")}</p>
            </div>
          )}
        </div>
      </div>
    </AuthGate>
  );
}
function Chat({
  id,
  conversation,
}: {
  id: string;
  conversation?: Conversation;
}) {
  const { t } = useLocale();
  const user = useUser();
  const cache = useQueryClient();
  const queued = useOutbox(user.data?.id, id);
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"offer" | "meetup" | null>(null);
  const [amount, setAmount] = useState("");
  const [previousId, setPreviousId] = useState<string | undefined>();
  const [place, setPlace] = useState("");
  const [time, setTime] = useState("");
  const [older, setOlder] = useState<Thread["messages"]>([]);
  const [hasOlder, setHasOlder] = useState(true);
  const retryMessage = useRef<{ body: string; clientId: string } | null>(null);
  const thread = useQuery({
    queryKey: ["thread", id],
    queryFn: () => api<Thread>("/v1/conversations/" + id),
    refetchInterval: 8000,
  });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["thread", id] });
    await cache.invalidateQueries({ queryKey: ["conversations"] });
  };
  const action = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      data,
    }: {
      path: string;
      method?: string;
      data?: unknown;
    }) => api(path, method, data),
    onSuccess: async () => {
      setMode(null);
      setPreviousId(undefined);
      await refresh();
    },
  });
  const send = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!user.data) throw new Error("Sign in to send a message.");
      outbox.enqueue({
        clientId: crypto.randomUUID(),
        conversationId: id,
        userId: user.data.id,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      void outbox.flush().then(refresh);
    },
    onSuccess: async () => {
      setBody("");
      retryMessage.current = null;
      void refresh();
    },
  });
  const previous = useMutation({
    mutationFn: () =>
      api<Thread>(
        "/v1/conversations/" +
          id +
          "?before=" +
          (older[0]?.id || thread.data?.messages[0]?.id),
      ),
    onSuccess: (r) => {
      setOlder((o) => [...r.messages, ...o]);
      setHasOlder(r.hasEarlier);
    },
  });
  const change = (path: string, status: string) =>
    action.mutate({
      path: "/v1/conversations/" + id + path,
      method: "PATCH",
      data: { status },
    });
  const lastMessage = thread.data?.messages.at(-1)?.id;
  useEffect(() => {
    const read = () => {
      if (!lastMessage || document.visibilityState !== "visible") return;
      void api("/v1/conversations/" + id + "/read", "PATCH", {
        messageId: lastMessage,
      }).catch(() => {});
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [id, lastMessage]);

  if (thread.isPending) return <Loading />;
  if (thread.error)
    return <ErrorBox error={thread.error} retry={() => thread.refetch()} />;
  const data = thread.data;
  const messages = [...older, ...data.messages].filter(
    (m, i, a) => a.findIndex((x) => x.id === m.id) === i,
  );
  return (
    <section className="chat">
      <header className="chat-header">
        <div>
          <strong>{conversation?.otherName || t("messages")}</strong>
          <Link href={"/items/" + data.listingId}>
            {conversation?.title || t("browse")}
          </Link>
        </div>
        <button
          className="text-button"
          disabled={action.isPending || data.blocked}
          onClick={() => {
            if (window.confirm(t("block") + "?"))
              action.mutate({
                path:
                  "/v1/blocks/" +
                  (data.buyerId === user.data?.id
                    ? data.sellerId
                    : data.buyerId),
              });
          }}
        >
          {t("block")}
        </button>
      </header>
      <TradeActions thread={data} />
      <ReportControl
        userId={data.buyerId === user.data?.id ? data.sellerId : data.buyerId}
        messages={messages}
      />
      <p className="chat-safety">{t("safety")}</p>
      <div className="chat-body" aria-live="polite">
        {data.hasEarlier && hasOlder && (
          <button
            disabled={previous.isPending}
            onClick={() => previous.mutate()}
          >
            {t("more")}
          </button>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={"bubble " + (m.senderId === user.data?.id ? "mine" : "")}
          >
            <p>{m.body}</p>
            <time>{new Date(m.createdAt).toLocaleString()}</time>
          </div>
        ))}
        {queued
          .filter((m) => !data.messages.some((x) => x.clientId === m.clientId))
          .map((m) => (
            <div key={m.clientId} className="bubble mine">
              <p>{m.body}</p>
              <p role="status">
                {t(m.status === "failed" ? "failedMessage" : "queued")}
              </p>
              <button
                onClick={() => {
                  void outbox.retry(m).then(refresh);
                }}
              >
                {t("retry")}
              </button>
              <button onClick={() => outbox.discard(m)}>{t("delete")}</button>
            </div>
          ))}
        {data.offers.map((o) => (
          <div className="event-card" key={o.id}>
            <strong>
              {t("offer")}: {money(o.amountMinor)}
            </strong>
            <span className="badge">{t(o.status)}</span>
            {o.status === "pending" && !data.blocked && (
              <div className="button-row">
                {o.senderId === user.data?.id ? (
                  <button
                    disabled={action.isPending}
                    onClick={() => change("/offers/" + o.id, "withdrawn")}
                  >
                    {t("withdraw")}
                  </button>
                ) : (
                  <>
                    <button
                      disabled={action.isPending}
                      onClick={() => change("/offers/" + o.id, "accepted")}
                    >
                      {t("accept")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviousId(o.id);
                        setMode("offer");
                      }}
                    >
                      {t("counter")}
                    </button>
                    <button
                      disabled={action.isPending}
                      onClick={() => change("/offers/" + o.id, "declined")}
                    >
                      {t("decline")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {data.meetups.map((m) => (
          <div className="event-card" key={m.id}>
            <strong>
              <CalendarDays size={16} /> {m.place}
            </strong>
            <p>
              {new Date(m.scheduledAt).toLocaleString(undefined, {
                timeZone: "Africa/Addis_Ababa",
              })}{" "}
              · Addis Ababa
            </p>
            <span className="badge">{t(m.status)}</span>
            {!data.blocked && (
              <div className="button-row">
                {m.status === "proposed" && m.proposerId !== user.data?.id && (
                  <button
                    disabled={action.isPending}
                    onClick={() => change("/meetups/" + m.id, "confirmed")}
                  >
                    {t("confirm")}
                  </button>
                )}
                {["proposed", "confirmed"].includes(m.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviousId(m.id);
                      setMode("meetup");
                      setPlace(m.place);
                    }}
                  >
                    {t("reschedule")}
                  </button>
                )}
                {m.status === "confirmed" &&
                  Date.parse(m.scheduledAt) <= Date.now() && (
                    <button
                      disabled={action.isPending}
                      onClick={() =>
                        change("/meetups/" + m.id, "no_show_reported")
                      }
                    >
                      {t("noShow")}
                    </button>
                  )}
                {["proposed", "confirmed"].includes(m.status) && (
                  <button
                    disabled={action.isPending}
                    onClick={() => change("/meetups/" + m.id, "cancelled")}
                  >
                    {t("cancel")}
                  </button>
                )}
                {m.status === "confirmed" &&
                  Date.parse(m.scheduledAt) <= Date.now() && (
                    <button
                      disabled={action.isPending}
                      onClick={() => change("/meetups/" + m.id, "completed")}
                    >
                      {t("complete")}
                    </button>
                  )}
              </div>
            )}
          </div>
        ))}
      </div>
      {action.error && <ErrorBox error={action.error} />}{" "}
      {previous.error && <ErrorBox error={previous.error} />}{" "}
      {send.error && <ErrorBox error={send.error} />}{" "}
      {data.blocked ? (
        <p className="error-box">{t("blocked")}</p>
      ) : (
        <div className="composer">
          <div className="button-row">
            <button
              onClick={() => (
                setPreviousId(undefined),
                setMode(mode === "offer" ? null : "offer")
              )}
            >
              {t("offer")}
            </button>
            <button
              onClick={() => (
                setPreviousId(undefined),
                setMode(mode === "meetup" ? null : "meetup")
              )}
            >
              {t("meetup")}
            </button>
          </div>
          {mode && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === "offer")
                  action.mutate({
                    path: "/v1/conversations/" + id + "/offers",
                    data: { amountMinor: parsePrice(amount), previousId },
                  });
                else
                  action.mutate({
                    path: "/v1/conversations/" + id + "/meetups",
                    data: {
                      place,
                      previousId,
                      scheduledAt: new Date(time + ":00+03:00").toISOString(),
                    },
                  });
              }}
            >
              {mode === "offer" ? (
                <label>
                  {t("price")}
                  <input
                    type="number"
                    min="0.01"
                    max="20000000"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <label>
                    {t("place")}
                    <input
                      minLength={5}
                      maxLength={250}
                      required
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("when")} · Addis Ababa (UTC+3)
                    <input
                      type="datetime-local"
                      required
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </label>
                </>
              )}
              <button disabled={action.isPending}>{t("submit")}</button>
            </form>
          )}
          <form
            className="message-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) send.mutate();
            }}
          >
            <input
              aria-label={t("message")}
              placeholder={t("message")}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button
              className="button primary"
              aria-label={t("send")}
              disabled={send.isPending || !body.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
