import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, imageUrl, money } from "../../src/api";
import type { Listing } from "../../types";
import { useLocale, useUser } from "../../src/provider";
import { Button, ErrorBox, Field, Loading, Screen, s } from "../../src/ui";
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLocale();
  const user = useUser();
  const cache = useQueryClient();
  const [photo, setPhoto] = useState(0);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState("");
  const item = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api<Listing>("/v1/listings/" + id),
  });
  const saved = useQuery({
    queryKey: ["saved"],
    queryFn: () => api<{ items: Listing[] }>("/v1/favorites"),
    enabled: !!user.data,
  });
  const isSaved = !!saved.data?.items.some((i) => i.id === id);
  const save = useMutation({
    mutationFn: () => api("/v1/favorites/" + id, isSaved ? "DELETE" : "POST"),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["saved"] }),
  });
  const contact = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/v1/conversations", "POST", { listingId: id }),
    onSuccess: (r) => router.push("/chat/" + r.id),
  });
  const reportAction = useMutation({
    mutationFn: () => api("/v1/reports", "POST", { listingId: id, reason }),
    onSuccess: () => setReason(""),
  });
  if (item.isPending) return <Loading />;
  if (item.error)
    return (
      <Screen>
        <ErrorBox error={item.error} retry={() => item.refetch()} />
      </Screen>
    );
  const l = item.data;
  return (
    <Screen>
      <Image
        source={{ uri: imageUrl(l.images[photo]) }}
        style={[s.photo, { aspectRatio: 1.1, resizeMode: "contain" }]}
        accessibilityLabel={l.title}
      />
      <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>
        {l.images.map((src, i) => (
          <Pressable
            accessibilityLabel={"Photo " + (i + 1)}
            key={src}
            onPress={() => setPhoto(i)}
          >
            <Image
              source={{ uri: imageUrl(src) }}
              style={{
                width: 65,
                height: 65,
                borderRadius: 8,
                borderWidth: photo === i ? 2 : 0,
                borderColor: "#174d3e",
              }}
            />
          </Pressable>
        ))}
      </ScrollView>
      <Text style={s.badge}>{t(l.status)}</Text>
      <Text style={s.heading}>{l.title}</Text>
      <Text style={[s.heading, { fontSize: 30 }]}>{money(l.priceMinor)}</Text>
      <Text style={s.muted}>
        {t(l.negotiable ? "negotiable" : "firm")} · {t(l.condition)}
      </Text>
      <Text style={s.body}>{l.neighborhood}, Addis Ababa</Text>
      <View style={s.card}>
        <Text style={s.h2}>{l.sellerName}</Text>
        {l.sellerPhoneVerified && (
          <Text style={s.muted}>✓ {t("verified")}</Text>
        )}
      </View>
      {user.data?.id === l.sellerId ? (
        <Button
          title={t("edit")}
          disabled={["sold", "removed"].includes(l.status)}
          onPress={() => router.push("/edit/" + id)}
        />
      ) : (
        <Button
          title={t("contact")}
          disabled={contact.isPending || l.status !== "active"}
          onPress={() =>
            user.data ? contact.mutate() : router.push("/signin")
          }
        />
      )}
      <Button
        title={isSaved ? "♥ " + t("saved") : "♡ " + t("save")}
        secondary
        disabled={save.isPending}
        onPress={() => (user.data ? save.mutate() : router.push("/signin"))}
      />
      {contact.error && <ErrorBox error={contact.error} />}
      {save.error && <ErrorBox error={save.error} />}
      <View style={s.hero}>
        <Text style={s.body}>{t("safety")}</Text>
        <Text style={s.muted}>{t("noDelivery")}</Text>
      </View>
      <Text style={s.h2}>{t("description")}</Text>
      <Text style={s.body}>{l.description}</Text>
      <Text style={s.h2}>{t("defects")}</Text>
      <Text style={s.body}>{l.defects}</Text>
      <Button
        title={t("report")}
        secondary
        onPress={() =>
          user.data ? setReport(!report) : router.push("/signin")
        }
      />
      {report && (
        <>
          <Field
            label={t("reason")}
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={1000}
          />
          <Button
            title={t("submit")}
            disabled={reason.trim().length < 10 || reportAction.isPending}
            onPress={() => reportAction.mutate()}
          />
          {reportAction.error && <ErrorBox error={reportAction.error} />}
          {reportAction.isSuccess && (
            <Text style={s.body}>{t("reportSent")}</Text>
          )}
        </>
      )}
    </Screen>
  );
}
