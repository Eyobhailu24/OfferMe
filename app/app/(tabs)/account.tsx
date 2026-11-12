import { useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, auth, imageUrl, money } from "../../src/api";
import type { Listing, Locale } from "../../types";
import { useLocale, useUser } from "../../src/provider";
import {
  Button,
  Choice,
  Empty,
  ErrorBox,
  Field,
  Gate,
  Loading,
  Screen,
  s,
} from "../../src/ui";
export default function Account() {
  const { locale, setLocale, t } = useLocale();
  const user = useUser();
  const cache = useQueryClient();
  const signout = useMutation({
    mutationFn: async () => {
      const result = await auth.signOut();
      if (result.error)
        throw new Error(result.error.message || "Please try again.");
      cache.clear();
      router.replace("/");
    },
  });
  return (
    <Screen>
      <Choice
        label="Language / ቋንቋ / Afaan"
        value={locale}
        onChange={(v) => setLocale(v as Locale)}
        options={[
          { value: "en", label: "English" },
          { value: "am", label: "አማርኛ" },
          { value: "om", label: "Afaan Oromo" },
        ]}
      />
      <Gate>
        {user.data && (
          <>
            <Profile key={user.data.id} name={user.data.name} />
            <Mine />
            <Button
              title={t("signout")}
              secondary
              disabled={signout.isPending}
              onPress={() => signout.mutate()}
            />
            {signout.error && <ErrorBox error={signout.error} />}
          </>
        )}
      </Gate>
    </Screen>
  );
}
function Profile({ name }: { name: string }) {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [value, setValue] = useState(name);
  const update = useMutation({
    mutationFn: () => api("/v1/me", "PATCH", { name: value }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <View style={s.card}>
      <Text style={s.h2}>{t("profile")}</Text>
      <Field
        label={t("name")}
        maxLength={50}
        value={value}
        onChangeText={setValue}
      />
      <Button
        title={t("save")}
        disabled={update.isPending}
        onPress={() => update.mutate()}
      />
      {update.error && <ErrorBox error={update.error} />}
      {update.isSuccess && <Text style={s.muted}>✓ {t("save")}</Text>}
    </View>
  );
}
function Mine() {
  const { t } = useLocale();
  const cache = useQueryClient();
  const mine = useQuery({
    queryKey: ["mine"],
    queryFn: () => api<{ items: Listing[] }>("/v1/listings/mine"),
  });
  const change = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api("/v1/listings/" + id + "/status", "PATCH", { status }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["mine"] });
      await cache.invalidateQueries({ queryKey: ["listings"] });
      await cache.invalidateQueries({ queryKey: ["listing"] });
    },
  });
  return (
    <View style={{ gap: 18, marginTop: 25 }}>
      <Text style={s.h2}>{t("selling")}</Text>
      {change.error && <ErrorBox error={change.error} />}
      {mine.isPending ? (
        <Loading />
      ) : mine.error ? (
        <ErrorBox error={mine.error} retry={() => mine.refetch()} />
      ) : !mine.data.items.length ? (
        <Empty />
      ) : (
        mine.data.items.map((l) => (
          <View key={l.id} style={s.card}>
            <View style={s.row}>
              <Image
                source={{ uri: imageUrl(l.images[0]) }}
                style={{ width: 65, height: 65, borderRadius: 8 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>{l.title}</Text>
                <Text style={s.body}>{money(l.priceMinor)}</Text>
              </View>
            </View>
            <Text style={s.badge}>{t(l.status)}</Text>
            <Button
              title={t("browse")}
              secondary
              onPress={() => router.push("/items/" + l.id)}
            />
            {!["sold", "removed"].includes(l.status) && (
              <>
                <Button
                  title={t("edit")}
                  secondary
                  onPress={() => router.push("/edit/" + l.id)}
                />
                <Button
                  title={t("markSold")}
                  disabled={change.isPending}
                  onPress={() =>
                    Alert.alert(
                      t("markSold"),
                      "Sold listings cannot be reopened.",
                      [
                        { text: t("cancel"), style: "cancel" },
                        {
                          text: t("confirm"),
                          onPress: () =>
                            change.mutate({ id: l.id, status: "sold" }),
                        },
                      ],
                    )
                  }
                />
                <Button
                  title={t(l.status === "archived" ? "restore" : "archive")}
                  secondary
                  disabled={change.isPending}
                  onPress={() =>
                    change.mutate({
                      id: l.id,
                      status: l.status === "archived" ? "active" : "archived",
                    })
                  }
                />
                {["active", "reserved"].includes(l.status) && (
                  <Button
                    title={t(l.status === "active" ? "reserved" : "restore")}
                    secondary
                    disabled={change.isPending}
                    onPress={() =>
                      change.mutate({
                        id: l.id,
                        status: l.status === "active" ? "reserved" : "active",
                      })
                    }
                  />
                )}
              </>
            )}
          </View>
        ))
      )}
    </View>
  );
}
