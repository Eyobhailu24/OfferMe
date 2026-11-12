import { FlatList, Image, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, imageUrl } from "../../src/api";
import type { Conversation } from "../../types";
import { useLocale, useUser } from "../../src/provider";
import { useLive } from "../../src/live";
import { Button, ErrorBox, Gate, Loading, s } from "../../src/ui";
export default function Messages() {
  const { t } = useLocale();
  const user = useUser();
  useLive(user.data?.id);
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ items: Conversation[] }>("/v1/conversations"),
    enabled: !!user.data,
    refetchInterval: 15000,
  });
  return (
    <Gate>
      <FlatList
        style={s.screen}
        contentContainerStyle={{ padding: 20, gap: 12 }}
        data={conversations.data?.items || []}
        keyExtractor={(c) => c.id}
        refreshing={conversations.isRefetching}
        onRefresh={() => conversations.refetch()}
        renderItem={({ item: c }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/chat/" + c.id)}
            style={[s.card, s.row]}
          >
            <Image
              source={{ uri: imageUrl(c.images[0]) }}
              style={{ width: 60, height: 60, borderRadius: 9 }}
            />
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={s.h2}>{c.otherName}</Text>
              <Text style={s.body} numberOfLines={1}>
                {c.title}
              </Text>
              <Text style={s.muted} numberOfLines={1}>
                {c.lastMessage || t("message")}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          conversations.isPending ? (
            <Loading />
          ) : conversations.error ? (
            <ErrorBox
              error={conversations.error}
              retry={() => conversations.refetch()}
            />
          ) : (
            <View style={s.empty}>
              <Text style={s.h2}>{t("selectChat")}</Text>
              <Text style={s.muted}>{t("safety")}</Text>
              <Button title={t("browse")} onPress={() => router.push("/")} />
            </View>
          )
        }
      />
    </Gate>
  );
}
