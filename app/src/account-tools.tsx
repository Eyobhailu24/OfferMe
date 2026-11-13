import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Alert, Share, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { registerPush } from "./notifications";
import { useLocale } from "./provider";
import { Button, Choice, ErrorBox, Field, s } from "./ui";
export function AccountTools() {
  const { t, locale } = useLocale();
  const cache = useQueryClient();
  const [kind, setKind] = useState("support"),
    [body, setBody] = useState("");
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ pushEnabled: boolean }>("/v1/me/settings"),
  });
  const blocks = useQuery({
    queryKey: ["blocks"],
    queryFn: () => api<{ items: { id: string; name: string }[] }>("/v1/blocks"),
  });
  const searches = useQuery({
    queryKey: ["searches"],
    queryFn: () =>
      api<{
        items: {
          id: string;
          name: string;
          filters: Record<string, string | number>;
        }[];
      }>("/v1/saved-searches"),
  });
  const tickets = useQuery({
    queryKey: ["support"],
    queryFn: () =>
      api<{
        items: {
          id: string;
          kind: string;
          body: string;
          status: string;
          response: string | null;
        }[];
      }>("/v1/support"),
  });
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
      for (const key of ["settings", "blocks", "searches", "support"])
        await cache.invalidateQueries({ queryKey: [key] });
    },
  });
  const push = useMutation({ mutationFn: registerPush });
  const exportData = useMutation({
    mutationFn: async () => {
      const data = await api("/v1/me/export");
      const file = new File(
        Paths.cache,
        "offerme-account-export-" + Date.now() + ".json",
      );
      await file.write(JSON.stringify(data, null, 2));

      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        UTI: "public.json",
      });
      // Keep the private cache file available while the receiving app reads it.
    },
  });
  return (
    <View style={s.card}>
      <Text style={s.h2}>{t("settings")}</Text>
      {settings.data && (
        <Button
          title={
            t("pushEnabled") +
            ": " +
            (settings.data.pushEnabled ? t("on") : t("off"))
          }
          secondary
          disabled={action.isPending}
          onPress={() =>
            action.mutate({
              path: "/v1/me/settings",
              method: "PATCH",
              data: { locale, pushEnabled: !settings.data.pushEnabled },
            })
          }
        />
      )}
      <Button
        title={t("enablePush")}
        secondary
        disabled={push.isPending}
        onPress={() => push.mutate()}
      />
      <Text style={s.h2}>{t("blockedPeople")}</Text>
      {blocks.data?.items.map((b) => (
        <View key={b.id}>
          <Text style={s.body}>{b.name}</Text>
          <Button
            title={t("unblock")}
            secondary
            disabled={action.isPending}
            onPress={() =>
              action.mutate({ path: "/v1/blocks/" + b.id, method: "DELETE" })
            }
          />
        </View>
      ))}
      <Text style={s.h2}>{t("savedSearches")}</Text>
      {searches.data?.items.map((search) => (
        <View key={search.id}>
          <Button
            title={search.name}
            secondary
            onPress={() =>
              router.push({ pathname: "/", params: { savedSearch: search.id } })
            }
          />
          <Button
            title={t("delete")}
            secondary
            disabled={action.isPending}
            onPress={() =>
              action.mutate({
                path: "/v1/saved-searches/" + search.id,
                method: "DELETE",
              })
            }
          />
        </View>
      ))}
      <Choice
        label={t("support")}
        value={kind}
        onChange={setKind}
        options={["support", "recovery", "appeal"].map((v) => ({
          value: v,
          label: t(v),
        }))}
      />
      <Field
        label={t("reason")}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={4000}
      />
      <Button
        title={t("submit")}
        disabled={action.isPending || body.trim().length < 15}
        onPress={() =>
          action.mutate({ path: "/v1/support", data: { kind, body } })
        }
      />
      {tickets.data?.items.map((ticket) => (
        <View style={s.card} key={ticket.id}>
          <Text style={s.h2}>
            {t(ticket.kind)} - {t(ticket.status)}
          </Text>
          <Text style={s.body}>{ticket.body}</Text>
          {ticket.response && <Text style={s.body}>{ticket.response}</Text>}
        </View>
      ))}
      <Button
        title={t("exportData")}
        secondary
        disabled={exportData.isPending}
        onPress={() => exportData.mutate()}
      />
      <Button
        title={t("deletionRequest")}
        secondary
        disabled={action.isPending}
        onPress={() =>
          Alert.alert(t("deletionRequest"), t("deletionNotice"), [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("confirm"),
              onPress: () => action.mutate({ path: "/v1/me/deletion" }),
            },
          ])
        }
      />
      {[
        action.error,
        push.error,
        exportData.error,
        settings.error,
        blocks.error,
        searches.error,
        tickets.error,
      ]
        .filter(Boolean)
        .map((e, i) => (
          <ErrorBox key={i} error={e} />
        ))}
    </View>
  );
}
