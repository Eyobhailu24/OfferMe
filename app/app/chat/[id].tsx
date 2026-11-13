import { ReportControl } from "../../src/report-control";
import { outbox, useOutbox } from "../../src/outbox";
import { TradeActions } from "../../src/exchanges";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, money, parsePrice } from "../../src/api";
import type { Thread } from "../../types";
import { useLocale, useUser } from "../../src/provider";
import { useLive } from "../../src/live";
import {
  Button,
  ErrorBox,
  Field,
  Gate,
  Loading,
  Screen,
  s,
  colors,
} from "../../src/ui";
export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Gate>
      <Chat key={id} id={id} />
    </Gate>
  );
}
function Chat({ id }: { id: string }) {
  const { t } = useLocale();
  const user = useUser();
  useLive(user.data?.id);
  const cache = useQueryClient();
  const queued = useOutbox(user.data?.id, id);
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"offer" | "meetup" | null>(null);
  const [amount, setAmount] = useState("");
  const [previousId, setPreviousId] = useState<string | undefined>();
  const [place, setPlace] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [older, setOlder] = useState<Thread["messages"]>([]);
  const [hasOlder, setHasOlder] = useState(true);
  const pending = useRef<{ body: string; clientId: string } | null>(null);
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
        clientId: Crypto.randomUUID(),
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
      pending.current = null;
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
  const proposal = useMutation({
    mutationFn: () => {
      if (mode === "offer") {
        const n = Number(amount);
        if (!amount.trim() || !Number.isFinite(n) || n <= 0)
          throw new Error("Enter a positive price.");
        return api("/v1/conversations/" + id + "/offers", "POST", {
          amountMinor: parsePrice(amount),
          previousId,
        });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
        throw new Error("Use YYYY-MM-DD and HH:MM in Addis Ababa time.");
      const scheduled = new Date(date + "T" + time + ":00+03:00");
      if (
        !Number.isFinite(scheduled.getTime()) ||
        new Date(scheduled.getTime() + 3 * 3600000)
          .toISOString()
          .slice(0, 16) !==
          date + "T" + time
      )
        throw new Error("Choose a valid date and time.");
      return api("/v1/conversations/" + id + "/meetups", "POST", {
        place,
        scheduledAt: scheduled.toISOString(),
        previousId,
      });
    },
    onSuccess: async () => {
      setMode(null);
      setPreviousId(undefined);
      await refresh();
    },
  });
  const change = (path: string, status: string) =>
    action.mutate({
      path: "/v1/conversations/" + id + path,
      method: "PATCH",
      data: { status },
    });
  const lastMessage = thread.data?.messages.at(-1)?.id;
  useFocusEffect(
    useCallback(() => {
      const read = () => {
        if (!lastMessage || AppState.currentState !== "active") return;
        void api("/v1/conversations/" + id + "/read", "PATCH", {
          messageId: lastMessage,
        }).catch(() => {});
      };
      read();
      const listener = AppState.addEventListener("change", read);
      return () => listener.remove();
    }, [id, lastMessage]),
  );

  if (thread.isPending)
    return (
      <Screen>
        <Loading />
        {queued.map((m) => (
          <View key={m.clientId} style={s.card}>
            <Text style={s.body}>{m.body}</Text>
            <Text style={s.muted}>
              {t(m.status === "failed" ? "failedMessage" : "queued")}
            </Text>
          </View>
        ))}
      </Screen>
    );
  if (thread.error)
    return (
      <Screen>
        <ErrorBox error={thread.error} retry={() => thread.refetch()} />
      </Screen>
    );
  const data = thread.data;
  const messages = [...older, ...data.messages].filter(
    (m, i, a) => a.findIndex((x) => x.id === m.id) === i,
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <Button
          title={t("browse")}
          secondary
          onPress={() => router.push("/items/" + data.listingId)}
        />
        <View style={s.hero}>
          <Text style={s.muted}>{t("safety")}</Text>
        </View>
        <TradeActions thread={data} />
        <ReportControl
          userId={data.buyerId === user.data?.id ? data.sellerId : data.buyerId}
          messages={messages}
        />
        {data.hasEarlier && hasOlder && (
          <Button
            title={t("more")}
            secondary
            disabled={previous.isPending}
            onPress={() => previous.mutate()}
          />
        )}
        {messages.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf:
                m.senderId === user.data?.id ? "flex-end" : "flex-start",
              backgroundColor:
                m.senderId === user.data?.id ? colors.green : colors.cream,
              padding: 15,
              borderRadius: 14,
              maxWidth: "88%",
              gap: 5,
            }}
          >
            <Text
              style={[
                s.body,
                { color: m.senderId === user.data?.id ? "#fff" : colors.ink },
              ]}
            >
              {m.body}
            </Text>
            <Text
              style={{
                fontSize: 9,
                color: m.senderId === user.data?.id ? "#c4d5c7" : colors.muted,
              }}
            >
              {new Date(m.createdAt).toLocaleString()}
            </Text>
          </View>
        ))}
        {queued
          .filter((m) => !data.messages.some((x) => x.clientId === m.clientId))
          .map((m) => (
            <View key={m.clientId} style={s.card}>
              <Text style={s.body}>{m.body}</Text>
              <Text style={s.muted}>
                {t(m.status === "failed" ? "failedMessage" : "queued")}
              </Text>
              <Button
                title={t("retry")}
                secondary
                onPress={() => {
                  void outbox.retry(m).then(refresh);
                }}
              />
              <Button
                title={t("delete")}
                secondary
                onPress={() => outbox.discard(m)}
              />
            </View>
          ))}
        {data.offers.map((o) => (
          <View key={o.id} style={s.card}>
            <Text style={s.h2}>
              {t("offer")}: {money(o.amountMinor)}
            </Text>
            <Text style={s.badge}>{t(o.status)}</Text>
            {o.status === "pending" &&
              !data.blocked &&
              (o.senderId === user.data?.id ? (
                <Button
                  title={t("withdraw")}
                  secondary
                  disabled={action.isPending}
                  onPress={() => change("/offers/" + o.id, "withdrawn")}
                />
              ) : (
                <View style={s.row}>
                  <Button
                    title={t("accept")}
                    disabled={action.isPending}
                    onPress={() => change("/offers/" + o.id, "accepted")}
                  />
                  <Button
                    title={t("counter")}
                    secondary
                    onPress={() => {
                      setPreviousId(o.id);
                      setMode("offer");
                    }}
                  />
                  <Button
                    title={t("decline")}
                    secondary
                    disabled={action.isPending}
                    onPress={() => change("/offers/" + o.id, "declined")}
                  />
                </View>
              ))}
          </View>
        ))}
        {data.meetups.map((m) => (
          <View key={m.id} style={s.card}>
            <Text style={s.h2}>{m.place}</Text>
            <Text style={s.body}>
              {new Date(m.scheduledAt).toLocaleString(undefined, {
                timeZone: "Africa/Addis_Ababa",
              })}
              · Addis Ababa
            </Text>
            <Text style={s.badge}>{t(m.status)}</Text>
            {!data.blocked && (
              <View style={s.row}>
                {m.status === "proposed" && m.proposerId !== user.data?.id && (
                  <Button
                    title={t("confirm")}
                    disabled={action.isPending}
                    onPress={() => change("/meetups/" + m.id, "confirmed")}
                  />
                )}
                {["proposed", "confirmed"].includes(m.status) && (
                  <Button
                    title={t("reschedule")}
                    secondary
                    onPress={() => {
                      setPreviousId(m.id);
                      setMode("meetup");
                      setPlace(m.place);
                    }}
                  />
                )}
                {m.status === "confirmed" &&
                  Date.parse(m.scheduledAt) <= Date.now() && (
                    <Button
                      title={t("noShow")}
                      secondary
                      disabled={action.isPending}
                      onPress={() =>
                        change("/meetups/" + m.id, "no_show_reported")
                      }
                    />
                  )}
                {["proposed", "confirmed"].includes(m.status) && (
                  <Button
                    title={t("cancel")}
                    secondary
                    disabled={action.isPending}
                    onPress={() => change("/meetups/" + m.id, "cancelled")}
                  />
                )}
                {m.status === "confirmed" &&
                  Date.parse(m.scheduledAt) <= Date.now() && (
                    <Button
                      title={t("complete")}
                      disabled={action.isPending}
                      onPress={() => change("/meetups/" + m.id, "completed")}
                    />
                  )}
              </View>
            )}
          </View>
        ))}
        {[action.error, send.error, previous.error, proposal.error]
          .filter(Boolean)
          .map((e, i) => (
            <ErrorBox key={i} error={e} />
          ))}
        {data.blocked ? (
          <Text style={s.error}>{t("blocked")}</Text>
        ) : (
          <>
            <View style={s.row}>
              <Button
                title={t("offer")}
                secondary
                onPress={() => (
                  setPreviousId(undefined),
                  setMode(mode === "offer" ? null : "offer")
                )}
              />
              <Button
                title={t("meetup")}
                secondary
                onPress={() => (
                  setPreviousId(undefined),
                  setMode(mode === "meetup" ? null : "meetup")
                )}
              />
            </View>
            {mode && (
              <View style={s.card}>
                {mode === "offer" ? (
                  <Field
                    label={t("price")}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                  />
                ) : (
                  <>
                    <Field
                      label={t("place")}
                      value={place}
                      onChangeText={setPlace}
                      maxLength={250}
                    />
                    <Field
                      label={t("when") + " (YYYY-MM-DD)"}
                      value={date}
                      onChangeText={setDate}
                      placeholder="2026-11-15"
                    />
                    <Field
                      label="HH:MM · Addis Ababa (UTC+3)"
                      value={time}
                      onChangeText={setTime}
                      placeholder="14:30"
                    />
                  </>
                )}
                <Button
                  title={t("submit")}
                  disabled={proposal.isPending}
                  onPress={() => proposal.mutate()}
                />
              </View>
            )}
            <Field
              label={t("message")}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={2000}
            />
            <Button
              title={t("send")}
              disabled={send.isPending || !body.trim()}
              onPress={() => send.mutate()}
            />
            <Button
              title={t("block")}
              secondary
              disabled={action.isPending}
              onPress={() =>
                Alert.alert(t("block"), undefined, [
                  { text: t("cancel"), style: "cancel" },
                  {
                    text: t("confirm"),
                    onPress: () =>
                      action.mutate({
                        path:
                          "/v1/blocks/" +
                          (data.buyerId === user.data?.id
                            ? data.sellerId
                            : data.buyerId),
                      }),
                  },
                ])
              }
            />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
