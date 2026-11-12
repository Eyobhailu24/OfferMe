import { useState } from "react";
import {
  Image,
  Switch,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, imageUrl } from "./api";
import { useLocale, useUser } from "./provider";
import type { Catalog, Listing } from "../types";
import {
  Button,
  Choice,
  ErrorBox,
  Field,
  Gate,
  Loading,
  Screen,
  s,
} from "./ui";
export function Sell({ id }: { id?: string }) {
  const user = useUser();
  const listing = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api<Listing>("/v1/listings/" + id),
    enabled: !!id && !!user.data,
  });
  return (
    <Gate>
      {id && listing.isPending ? (
        <Loading />
      ) : listing.error ? (
        <Screen>
          <ErrorBox error={listing.error} />
        </Screen>
      ) : (
        <Form key={id || "new"} initial={listing.data} />
      )}
    </Gate>
  );
}
function Form({ initial }: { initial?: Listing }) {
  const { t, locale } = useLocale();
  const cache = useQueryClient();
  const user = useUser();
  const [images, setImages] = useState(initial?.images || []);
  const [draft, setDraft] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    defects: initial?.defects || "",
    price: initial ? String(initial.priceMinor / 100) : "",
    categoryId: initial?.categoryId || "phones",
    condition: initial?.condition || "good",
    neighborhood: initial?.neighborhood || "Bole",
    negotiable: initial?.negotiable ?? true,
  });
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/v1/catalog"),
    staleTime: Infinity,
  });
  const update = (key: string, value: string | boolean) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const upload = useMutation({
    mutationFn: async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 12 - images.length,
        quality: 0.8,
      });
      if (result.canceled) return;
      if (images.length + result.assets.length > 12)
        throw new Error("Choose up to 12 photos.");
      for (const asset of result.assets) {
        if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024)
          throw new Error("Choose photos under 8 MB.");
        const body = new FormData();
        body.append("file", {
          uri: asset.uri,
          name: asset.fileName || "photo.jpg",
          type: asset.mimeType || "image/jpeg",
        } as unknown as Blob);
        const response = await api<{ url: string }>("/v1/media", "POST", body);
        setImages((i) => [...i, response.url]);
      }
    },
  });
  const publish = useMutation({
    mutationFn: () => {
      if (!images.length) throw new Error("Add at least one photo.");
      if (draft.price.trim() === "" || !Number.isFinite(Number(draft.price)))
        throw new Error("Enter a price.");
      const { price, ...rest } = draft;
      return api<{ id: string }>(
        "/v1/listings" + (initial ? "/" + initial.id : ""),
        initial ? "PATCH" : "POST",
        { ...rest, priceMinor: Math.round(Number(price) * 100), images },
      );
    },
    onSuccess: async (r) => {
      await cache.invalidateQueries({ queryKey: ["listings"] });
      await cache.invalidateQueries({ queryKey: ["mine"] });
      await cache.invalidateQueries({ queryKey: ["listing", r.id] });
      if (!initial) {
        setImages([]);
        setDraft({
          title: "",
          description: "",
          defects: "",
          price: "",
          categoryId: "phones",
          condition: "good",
          neighborhood: "Bole",
          negotiable: true,
        });
      }
      router.push("/items/" + r.id);
    },
  });
  if (
    initial &&
    (initial.sellerId !== user.data?.id ||
      ["sold", "removed"].includes(initial.status))
  )
    return <ErrorBox error={new Error("This listing cannot be edited.")} />;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <Text style={s.heading}>{t(initial ? "edit" : "sell")}</Text>
        <Text style={s.muted}>{t("noDelivery")}</Text>
        <Text style={s.h2}>
          {t("photos")} · {images.length}/12
        </Text>
        <View style={s.row}>
          {images.map((src, i) => (
            <View key={src} style={{ width: 94, gap: 5 }}>
              <Image
                source={{ uri: imageUrl(src) }}
                style={{ width: 94, height: 94, borderRadius: 9 }}
              />
              <Button
                title={"× " + (i + 1)}
                secondary
                onPress={() => setImages((v) => v.filter((s) => s !== src))}
              />
            </View>
          ))}
        </View>
        <Button
          title={upload.isPending ? t("loading") : t("addPhotos")}
          secondary
          disabled={upload.isPending || images.length >= 12}
          onPress={() => upload.mutate()}
        />
        {upload.error && <ErrorBox error={upload.error} />}
        <Field
          label={t("title")}
          value={draft.title}
          onChangeText={(v) => update("title", v)}
          maxLength={100}
        />
        <Choice
          label={t("category")}
          value={draft.categoryId}
          onChange={(v) => update("categoryId", v)}
          options={
            catalog.data?.categories.map((c) => ({
              value: c.id,
              label: locale === "en" ? c.name : c[locale],
            })) || []
          }
        />
        <Choice
          label={t("condition")}
          value={draft.condition}
          onChange={(v) => update("condition", v)}
          options={
            catalog.data?.conditions.map((c) => ({ value: c, label: t(c) })) ||
            []
          }
        />
        <Field
          label={t("description")}
          value={draft.description}
          onChangeText={(v) => update("description", v)}
          multiline
          maxLength={4000}
        />
        <Field
          label={t("defects")}
          value={draft.defects}
          onChangeText={(v) => update("defects", v)}
          multiline
          maxLength={1000}
        />
        <Field
          label={t("price")}
          value={draft.price}
          onChangeText={(v) => update("price", v)}
          keyboardType="decimal-pad"
        />
        <Choice
          label={t("neighborhood")}
          value={draft.neighborhood}
          onChange={(v) => update("neighborhood", v)}
          options={
            catalog.data?.neighborhoods.map((n) => ({ value: n, label: n })) ||
            []
          }
        />
        <View style={s.row}>
          <Switch
            accessibilityLabel={t("negotiable")}
            value={draft.negotiable}
            onValueChange={(v) => update("negotiable", v)}
            trackColor={{ true: "#174d3e" }}
          />
          <Text style={s.body}>{t("negotiable")}</Text>
        </View>
        <View style={s.hero}>
          <Text style={s.muted}>{t("safety")}</Text>
        </View>
        {catalog.error && (
          <ErrorBox error={catalog.error} retry={() => catalog.refetch()} />
        )}
        {publish.error && <ErrorBox error={publish.error} />}
        <Button
          title={
            publish.isPending ? t("loading") : t(initial ? "save" : "publish")
          }
          disabled={publish.isPending || upload.isPending || !catalog.data}
          onPress={() => publish.mutate()}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
