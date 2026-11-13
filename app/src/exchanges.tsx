import { ReportControl } from "./report-control";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Sale, Thread, Reputation as ReputationType } from "../types";
import { useLocale, useUser } from "./provider";
import { Button, Choice, ErrorBox, Field, s } from "./ui";
export function Reputation({ userId }: { userId: string }) {
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ["reputation", userId],
    queryFn: () => api<ReputationType>("/v1/users/" + userId + "/reputation"),
  });
  return (
    <View style={s.card}>
      <Text style={s.h2}>{t("reputation")}</Text>
      {query.error && <ErrorBox error={query.error} />}
      {query.data && (
        <>
          <Text style={s.body}>
            {query.data.rating === null
              ? t("noReviews")
              : query.data.rating + " / 5"}{" "}
            ({query.data.count})
          </Text>
          {query.data.reviews.map((r) => (
            <View key={r.id}>
              <Text style={s.body}>
                {r.authorName} - {r.rating}/5
              </Text>
              <Text style={s.body}>{r.body}</Text>
              <ReportControl reviewId={r.id} />
            </View>
          ))}
        </>
      )}
    </View>
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
  return (
    <View style={s.card}>
      <Text style={s.muted}>{t("exchangeNotice")}</Text>
      {thread.reservation && (
        <Text style={s.body}>
          {t("reserved")} -{" "}
          {new Date(thread.reservation.expiresAt).toLocaleString(undefined, {
            timeZone: "Africa/Addis_Ababa",
          })}{" "}
          (Addis Ababa)
        </Text>
      )}
      <Button
        title={t(thread.muted ? "unmute" : "mute")}
        secondary
        disabled={action.isPending}
        onPress={() =>
          action.mutate({
            path: "/v1/conversations/" + thread.id + "/mute",
            method: "PATCH",
            data: { muted: !thread.muted },
          })
        }
      />
      {thread.sellerId === user.data?.id &&
        !thread.blocked &&
        ["active", "reserved"].includes(thread.listingStatus) && (
          <>
            {thread.listingStatus === "active" && (
              <Button
                title={t("reserveBuyer")}
                disabled={action.isPending}
                onPress={() =>
                  action.mutate({
                    path: "/v1/listings/" + thread.listingId + "/reservations",
                    data: {
                      conversationId: thread.id,
                      expiresAt: new Date(Date.now() + 86400000).toISOString(),
                    },
                  })
                }
              />
            )}
            {thread.reservation?.buyerId === thread.buyerId && (
              <Button
                title={t("cancelReservation")}
                secondary
                disabled={action.isPending}
                onPress={() =>
                  action.mutate({
                    path: "/v1/listings/" + thread.listingId + "/status",
                    method: "PATCH",
                    data: { status: "active" },
                  })
                }
              />
            )}
            {(!thread.reservation ||
              thread.reservation.buyerId === thread.buyerId) && (
              <Button
                title={t("soldToBuyer")}
                disabled={action.isPending}
                onPress={() =>
                  Alert.alert(t("soldToBuyer"), t("confirmSold"), [
                    { text: t("cancel"), style: "cancel" },
                    {
                      text: t("confirm"),
                      onPress: () =>
                        action.mutate({
                          path: "/v1/listings/" + thread.listingId + "/sales",
                          data: { conversationId: thread.id },
                        }),
                    },
                  ])
                }
              />
            )}
          </>
        )}
      {action.error && <ErrorBox error={action.error} />}
    </View>
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
    <View style={s.card}>
      <Text style={s.h2}>{t("exchanges")}</Text>
      <Text style={s.muted}>{t("exchangeNotice")}</Text>
      {sales.error && <ErrorBox error={sales.error} />}
      {sales.data?.items.map((s) => (
        <SaleCard key={s.id} sale={s} userId={user.data!.id} />
      ))}
    </View>
  );
}
function SaleCard({ sale: sale, userId }: { sale: Sale; userId: string }) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const action = useMutation({
    mutationFn: ({ suffix, data }: { suffix: string; data: unknown }) =>
      api(
        "/v1/sales/" + sale.id + suffix,
        suffix === "/confirm" ? "PATCH" : "POST",
        data,
      ),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["sales"] });
      await cache.invalidateQueries({ queryKey: ["reputation"] });
    },
  });
  return (
    <View style={s.card}>
      <Text style={s.h2}>{sale.title}</Text>
      <Text style={s.body}>{sale.other_name || t("outsideSale")}</Text>
      {!sale.buyer_id ? (
        <Text style={s.muted}>{t("outsideNotice")}</Text>
      ) : !sale.buyer_confirmed ? (
        <>
          <Text style={s.body}>{t("awaitingConfirmation")}</Text>
          {sale.buyer_id === userId && (
            <Button
              title={t("confirmExchange")}
              disabled={action.isPending}
              onPress={() =>
                Alert.alert(t("confirmExchange"), t("exchangeNotice"), [
                  { text: t("cancel"), style: "cancel" },
                  {
                    text: t("confirm"),
                    onPress: () =>
                      action.mutate({ suffix: "/confirm", data: {} }),
                  },
                ])
              }
            />
          )}
        </>
      ) : sale.reviewed ? (
        <Text style={s.body}>{t("reviewSubmitted")}</Text>
      ) : (
        <>
          <Choice
            label={t("rating")}
            value={rating}
            onChange={setRating}
            options={["5", "4", "3", "2", "1"].map((v) => ({
              value: v,
              label: v,
            }))}
          />
          <Field
            label={t("review")}
            value={body}
            onChangeText={setBody}
            maxLength={1000}
            multiline
          />
          <Button
            title={t("submitReview")}
            disabled={action.isPending}
            onPress={() =>
              action.mutate({
                suffix: "/reviews",
                data: { rating: Number(rating), body },
              })
            }
          />
        </>
      )}
      {action.error && <ErrorBox error={action.error} />}
    </View>
  );
}
