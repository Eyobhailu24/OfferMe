import { keepPhoto, removePhoto, type PendingPhoto } from "./photo-queue";
import * as Location from "expo-location";
import { useDraft } from "./persistence";
import * as Crypto from "expo-crypto";
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
import { api, imageUrl, parsePrice } from "./api";
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
    queryFn: () => api<Listing>("/v1/listings/" + id + "/edit"),
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
        <Form
          key={user.data?.id + ":" + (id || "new")}
          initial={listing.data}
        />
      )}
    </Gate>
  );
}
function Form({ initial }: { initial?: Listing }) {
  const { t, locale } = useLocale();
  const cache = useQueryClient();
  const user = useUser();
  const draftKey =
    "offerme:draft:" + user.data!.id + ":" + (initial?.id || "new");
  const imageDraft = useDraft<string[]>(
    draftKey + ":photos",
    initial?.images || [],
  );
  const images = imageDraft.value,
    setImages = imageDraft.setValue;
  const pendingUploads = useDraft<PendingPhoto[]>(
    draftKey + ":pending-photos",
    [],
  );
  const identity = useDraft(draftKey + ":identity", Crypto.randomUUID());
  const clientId = identity.value;
  const savedDraft = useDraft(draftKey, {
    latitude: initial?.latitude as number | null | undefined,
    longitude: initial?.longitude as number | null | undefined,
    subcategory: initial?.subcategory || "",
    attributes: initial?.attributes || ({} as Record<string, string>),
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
  const draft = savedDraft.value,
    setDraft = savedDraft.setValue;
  const update = (key: string, value: string | boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(key === "categoryId" ? { subcategory: "", attributes: {} } : {}),
    }));
  const selectedCategory = catalog.data?.categories.find(
    (c) => c.id === draft.categoryId,
  );
  const attribute = (key: string, value: string) =>
    setDraft((d) => ({ ...d, attributes: { ...d.attributes, [key]: value } }));
  const locate = useMutation({
    mutationFn: async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Location permission was not granted. Select a neighborhood manually.",
        );
      const point = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setDraft((d) => ({
        ...d,
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
      }));
    },
  });
  async function flushPhotos(photos: PendingPhoto[] = pendingUploads.value) {
    for (const photo of photos) {
      const body = new FormData();
      body.append("clientId", photo.id);
      body.append("expectedOwnerId", user.data!.id);
      body.append("file", {
        uri: photo.uri,
        name: photo.name,
        type: photo.type,
      } as unknown as Blob);
      const response = await api<{ url: string }>("/v1/media", "POST", body);
      setImages((items) =>
        items.includes(response.url) ? items : [...items, response.url],
      );
      pendingUploads.setValue((items) =>
        items.filter((p) => p.id !== photo.id),
      );
      removePhoto(photo);
    }
  }
  const retryUploads = useMutation({ mutationFn: () => flushPhotos() });
  const upload = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 12 - images.length - pendingUploads.value.length,
        quality: 0.8,
      });
      if (result.canceled) return;
      if (
        images.length + pendingUploads.value.length + result.assets.length >
        12
      )
        throw new Error("Choose up to 12 photos.");
      const kept: PendingPhoto[] = [];
      for (const asset of result.assets) {
        if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024)
          throw new Error("Choose photos under 8 MB.");
        const photo = await keepPhoto(asset);
        kept.push(photo);
        pendingUploads.setValue((items) => [...items, photo]);
      }
      await flushPhotos([...pendingUploads.value, ...kept]);
    },
  });
  const publish = useMutation({
    networkMode: "always",
    mutationFn: () => {
      if (pendingUploads.value.length)
        throw new Error("Finish or remove pending photo uploads first.");
      if (!images.length) throw new Error("Add at least one photo.");
      if (draft.price.trim() === "" || !Number.isFinite(Number(draft.price)))
        throw new Error("Enter a price.");
      const { price, ...rest } = draft;
      return api<{ id: string }>(
        "/v1/listings" + (initial ? "/" + initial.id : ""),
        initial ? "PATCH" : "POST",
        {
          ...rest,
          expectedSellerId: user.data!.id,
          priceMinor: parsePrice(price),
          images,
          ...(!initial ? { clientId } : {}),
        },
      );
    },
    onSuccess: async (r) => {
      pendingUploads.clear();
      savedDraft.clear();
      imageDraft.clear();
      identity.clear();
      if (!initial) {
        pendingUploads.reset();
        savedDraft.reset();
        imageDraft.reset();
        identity.reset(Crypto.randomUUID());
      }
      await cache.invalidateQueries({ queryKey: ["listings"] });
      await cache.invalidateQueries({ queryKey: ["mine"] });
      await cache.invalidateQueries({ queryKey: ["listing", r.id] });
      router.push("/items/" + r.id);
    },
  });
  if (
    !savedDraft.ready ||
    !imageDraft.ready ||
    !identity.ready ||
    !pendingUploads.ready
  )
    return <Loading />;
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
        {!savedDraft.error && !imageDraft.error && !pendingUploads.error && (
          <Text style={s.muted}>{t("draftSaved")}</Text>
        )}
        <Button
          title={t("discardDraft")}
          secondary
          onPress={() => {
            for (const p of pendingUploads.value) removePhoto(p);
            pendingUploads.reset();
            savedDraft.reset();
            imageDraft.reset();
            identity.reset(Crypto.randomUUID());
          }}
        />
        {(savedDraft.error || imageDraft.error) && (
          <ErrorBox error={savedDraft.error || imageDraft.error} />
        )}
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
          disabled={
            upload.isPending ||
            retryUploads.isPending ||
            images.length + pendingUploads.value.length >= 12
          }
          onPress={() => upload.mutate()}
        />
        {pendingUploads.value.map((photo) => (
          <View key={photo.id} style={s.card}>
            <Image
              source={{ uri: photo.uri }}
              style={{ width: 90, height: 90 }}
            />
            <Text style={s.body}>{t("photosPending")}</Text>
            <Button
              title={t("delete")}
              secondary
              onPress={() => {
                removePhoto(photo);
                pendingUploads.setValue((items) =>
                  items.filter((p) => p.id !== photo.id),
                );
              }}
            />
          </View>
        ))}
        {!!pendingUploads.value.length && (
          <Button
            title={t("retry")}
            secondary
            disabled={retryUploads.isPending || upload.isPending}
            onPress={() => retryUploads.mutate()}
          />
        )}
        {(upload.error || retryUploads.error || pendingUploads.error) && (
          <ErrorBox
            error={upload.error || retryUploads.error || pendingUploads.error}
          />
        )}
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
        {selectedCategory && (
          <>
            <Choice
              label={t("subcategory")}
              value={draft.subcategory}
              onChange={(v) => update("subcategory", v)}
              options={selectedCategory.subcategories.map((v) => ({
                value: v,
                label: t(v),
              }))}
            />
            {selectedCategory.fields.map((field) =>
              field.options ? (
                <Choice
                  key={field.id}
                  label={t(field.id)}
                  value={draft.attributes[field.id] || ""}
                  onChange={(v) => attribute(field.id, v)}
                  options={field.options.map((v) => ({
                    value: v,
                    label: t(v),
                  }))}
                />
              ) : (
                <Field
                  key={field.id}
                  label={t(field.id)}
                  value={draft.attributes[field.id] || ""}
                  onChangeText={(v) => attribute(field.id, v)}
                  maxLength={250}
                />
              ),
            )}
          </>
        )}
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
        <Button
          title={t("useLocation")}
          secondary
          disabled={locate.isPending}
          onPress={() => locate.mutate()}
        />
        {locate.error && <ErrorBox error={locate.error} />}
        {draft.latitude != null && (
          <Button
            title={t("removeLocation")}
            secondary
            onPress={() =>
              setDraft((d) => ({ ...d, latitude: null, longitude: null }))
            }
          />
        )}
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
          disabled={
            publish.isPending ||
            upload.isPending ||
            retryUploads.isPending ||
            !!pendingUploads.value.length ||
            !catalog.data
          }
          onPress={() => publish.mutate()}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
