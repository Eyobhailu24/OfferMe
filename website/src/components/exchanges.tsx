"use client";
import { ReportControl } from "./report-control";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Sale, Thread, Reputation as ReputationType } from "@/lib/types";
import { useLocale, useUser } from "./provider";
import { ErrorBox } from "./ui";
export function Reputation({ userId }: { userId: string }) {
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ["reputation", userId],
    queryFn: () => api<ReputationType>("/v1/users/" + userId + "/reputation"),
  });
  return (
    <div>
      <h3>{t("reputation")}</h3>
      {query.error && <ErrorBox error={query.error} />}
      {query.data && (
        <>
          <p>
            {query.data.rating === null
              ? t("noReviews")
              : query.data.rating + " / 5"}{" "}
            ({query.data.count})
          </p>
          {query.data.reviews.map((r) => (
            <blockquote key={r.id}>
              <strong>
                {r.authorName} - {r.rating}/5
              </strong>
              <p>{r.body}</p>
              <ReportControl reviewId={r.id} />
            </blockquote>
          ))}
        </>
      )}
    </div>
  );
}
export function TradeActions({ thread }: { thread: Thread }) {
  const { t } = useLocale();
  const user = useUser();
  const cache = useQueryClient();
  const action = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      data = {},
    }: {
      path: string;
      method?: string;
      data?: unknown;
    }) => api(path, method, data),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["thread"] });
      await cache.invalidateQueries({ queryKey: ["mine"] });
      await cache.invalidateQueries({ queryKey: ["sales"] });
    },
  });
  const seller = thread.sellerId === user.data?.id;
  return (
    <div className="event-card">
      <p>{t("exchangeNotice")}</p>
      {thread.reservation && (
        <p>
          {t("reserved")} -{" "}
          {new Date(thread.reservation.expiresAt).toLocaleString(undefined, {
            timeZone: "Africa/Addis_Ababa",
          })}{" "}
          (Addis Ababa)
        </p>
      )}
      <div className="button-row">
        <button
          disabled={action.isPending}
          onClick={() =>
            action.mutate({
              path: "/v1/conversations/" + thread.id + "/mute",
              method: "PATCH",
              data: { muted: !thread.muted },
            })
          }
        >
          {t(thread.muted ? "unmute" : "mute")}
        </button>
        {seller &&
          !thread.blocked &&
          ["active", "reserved"].includes(thread.listingStatus) && (
            <>
              {thread.listingStatus === "active" && (
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path:
                        "/v1/listings/" + thread.listingId + "/reservations",
                      data: {
                        conversationId: thread.id,
                        expiresAt: new Date(
                          Date.now() + 86400000,
                        ).toISOString(),
                      },
                    })
                  }
                >
                  {t("reserveBuyer")}
                </button>
              )}
              {thread.reservation?.buyerId === thread.buyerId && (
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: "/v1/listings/" + thread.listingId + "/status",
                      method: "PATCH",
                      data: { status: "active" },
                    })
                  }
                >
                  {t("cancelReservation")}
                </button>
              )}
              {(!thread.reservation ||
                thread.reservation.buyerId === thread.buyerId) && (
                <button
                  disabled={action.isPending}
                  onClick={() => {
                    if (window.confirm(t("confirmSold")))
                      action.mutate({
                        path: "/v1/listings/" + thread.listingId + "/sales",
                        data: { conversationId: thread.id },
                      });
                  }}
                >
                  {t("soldToBuyer")}
                </button>
              )}
            </>
          )}
      </div>
      {action.error && <ErrorBox error={action.error} />}
    </div>
  );
}
export function Sales() {
  const { t } = useLocale();
  const user = useUser();
  const sales = useQuery({
    queryKey: ["sales"],
    queryFn: () => api<{ items: Sale[] }>("/v1/sales"),
  });
  return (
    <section>
      <h2>{t("exchanges")}</h2>
      <p>{t("exchangeNotice")}</p>
      {sales.error && <ErrorBox error={sales.error} />}{" "}
      {sales.data?.items.map((s) => (
        <SaleCard key={s.id} sale={s} userId={user.data!.id} />
      ))}
    </section>
  );
}
function SaleCard({ sale: s, userId }: { sale: Sale; userId: string }) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const action = useMutation({
    mutationFn: ({ suffix, data }: { suffix: string; data: unknown }) =>
      api(
        "/v1/sales/" + s.id + suffix,
        suffix === "/confirm" ? "PATCH" : "POST",
        data,
      ),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["sales"] });
      await cache.invalidateQueries({ queryKey: ["reputation"] });
    },
  });
  return (
    <article className="event-card">
      <h3>{s.title}</h3>
      <p>{s.other_name || t("outsideSale")}</p>
      {!s.buyer_id ? (
        <p>{t("outsideNotice")}</p>
      ) : !s.buyer_confirmed ? (
        <div>
          <p>{t("awaitingConfirmation")}</p>
          {s.buyer_id === userId && (
            <button
              disabled={action.isPending}
              onClick={() => {
                if (window.confirm(t("confirmExchange")))
                  action.mutate({ suffix: "/confirm", data: {} });
              }}
            >
              {t("confirmExchange")}
            </button>
          )}
        </div>
      ) : s.reviewed ? (
        <p>{t("reviewSubmitted")}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({
              suffix: "/reviews",
              data: { rating: Number(rating), body },
            });
          }}
        >
          <label>
            {t("rating")}
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
              {["5", "4", "3", "2", "1"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            {t("review")}
            <textarea
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button disabled={action.isPending}>{t("submitReview")}</button>
        </form>
      )}
      {action.error && <ErrorBox error={action.error} />}
    </article>
  );
}
