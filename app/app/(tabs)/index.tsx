import * as Location from "expo-location";
import { useLocalSearchParams } from "expo-router";
import { SaveSearch } from "../../src/save-search";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../src/api";
import type { Catalog, Page } from "../../types";
import { useLocale } from "../../src/provider";
import {
  s,
  Button,
  Choice,
  Empty,
  ErrorBox,
  Field,
  ListingCard,
  Loading,
} from "../../src/ui";
export default function Browse() {
  const { t, locale } = useLocale();
  const [q, setQ] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [filters, setFilters] = useState({
    latitude: "",
    longitude: "",
    radiusKm: "10",
    q: "",
    category: "",
    neighborhood: "",
    condition: "",
    sort: "recent",
    min: "",
    max: "",
    page: 1,
  });
  const [expanded, setExpanded] = useState(false);
  const { savedSearch } = useLocalSearchParams<{ savedSearch?: string }>();
  useEffect(() => {
    if (!savedSearch) return;
    let alive = true;
    void api<{
      items: { id: string; filters: Record<string, string | number> }[];
    }>("/v1/saved-searches")
      .then((result) => {
        const found = result.items.find((s) => s.id === savedSearch);
        if (found && alive) {
          const restored = Object.fromEntries(
            Object.entries(found.filters).map(([k, v]) => [
              k,
              ["min", "max"].includes(k) ? String(Number(v) / 100) : String(v),
            ]),
          );
          setFilters((f) => ({ ...f, ...restored, page: 1 }));
          setQ(String(found.filters.q || ""));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [savedSearch]);
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
      setCursors([null]);
      setFilters((f) => ({
        ...f,
        latitude: String(point.coords.latitude),
        longitude: String(point.coords.longitude),
        page: 1,
      }));
    },
  });
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/v1/catalog"),
    staleTime: Infinity,
  });
  const search = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => [
        k,
        k === "min" || k === "max"
          ? String(Math.round(Number(v) * 100))
          : String(v),
      ]),
  );
  if (cursors[filters.page - 1])
    search.set("cursor", cursors[filters.page - 1]!);
  const listings = useQuery({
    queryKey: ["listings", search.toString()],
    queryFn: () => api<Page>("/v1/listings?" + search),
  });
  const update = (key: string, value: string) => (
    setCursors([null]),
    setFilters((f) => ({ ...f, [key]: value, page: 1 }))
  );
  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={{ padding: 14, paddingBottom: 35 }}
      data={listings.data?.items || []}
      numColumns={2}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <ListingCard item={item} />}
      refreshing={listings.isRefetching}
      onRefresh={() => {
        void listings.refetch();
        void catalog.refetch();
      }}
      ListHeaderComponent={
        <View style={{ padding: 6, gap: 18, marginBottom: 20 }}>
          <View style={s.hero}>
            <Text style={s.eyebrow}>{t("local")}</Text>
            <Text style={s.heading}>{t("hero")}</Text>
            <Text style={s.muted}>{t("heroText")}</Text>
          </View>
          <Button
            title={t("nearby")}
            secondary
            disabled={locate.isPending}
            onPress={() => locate.mutate()}
          />
          {locate.error && <ErrorBox error={locate.error} />}
          {filters.latitude && (
            <Button
              title={t("removeLocation")}
              secondary
              onPress={() => {
                setCursors([null]);
                setFilters((f) => ({
                  ...f,
                  latitude: "",
                  longitude: "",
                  page: 1,
                }));
              }}
            />
          )}
          <SaveSearch query={search} />
          <Field
            label={t("search")}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            onSubmitEditing={() => update("q", q)}
          />
          <View style={s.row}>
            <Button title={t("searchButton")} onPress={() => update("q", q)} />
            <Button
              title={t("condition") + " / " + t("neighborhood")}
              secondary
              onPress={() => setExpanded(!expanded)}
            />
          </View>
          <Choice
            label={t("category")}
            value={filters.category}
            onChange={(v) => update("category", v)}
            options={[
              { value: "", label: t("all") },
              ...(catalog.data?.categories.map((c) => ({
                value: c.id,
                label: locale === "en" ? c.name : c[locale],
              })) || []),
            ]}
          />
          {expanded && (
            <>
              <Choice
                label={t("neighborhood")}
                value={filters.neighborhood}
                onChange={(v) => update("neighborhood", v)}
                options={[
                  { value: "", label: t("anywhere") },
                  ...(catalog.data?.neighborhoods.map((n) => ({
                    value: n,
                    label: n,
                  })) || []),
                ]}
              />
              <Choice
                label={t("condition")}
                value={filters.condition}
                onChange={(v) => update("condition", v)}
                options={[
                  { value: "", label: t("anyCondition") },
                  ...(catalog.data?.conditions.map((n) => ({
                    value: n,
                    label: t(n),
                  })) || []),
                ]}
              />
              <Choice
                label={t("price")}
                value={filters.sort}
                onChange={(v) => update("sort", v)}
                options={[
                  { value: "recent", label: t("recent") },
                  { value: "price_low", label: t("low") },
                  { value: "price_high", label: t("high") },
                ]}
              />
              <Field
                label={t("min")}
                keyboardType="decimal-pad"
                value={filters.min}
                onChangeText={(v) => update("min", v)}
              />
              <Field
                label={t("max")}
                keyboardType="decimal-pad"
                value={filters.max}
                onChangeText={(v) => update("max", v)}
              />
              <Button
                title={t("clear")}
                secondary
                onPress={() => {
                  setQ("");
                  setCursors([null]);
                  setFilters({
                    latitude: "",
                    longitude: "",
                    radiusKm: "10",
                    q: "",
                    category: "",
                    neighborhood: "",
                    condition: "",
                    sort: "recent",
                    min: "",
                    max: "",
                    page: 1,
                  });
                }}
              />
            </>
          )}
          <Text style={s.h2}>{t("fresh")}</Text>
          {catalog.error && (
            <ErrorBox error={catalog.error} retry={() => catalog.refetch()} />
          )}
        </View>
      }
      ListEmptyComponent={
        listings.isPending ? (
          <Loading />
        ) : listings.error ? (
          <ErrorBox error={listings.error} retry={() => listings.refetch()} />
        ) : (
          <Empty />
        )
      }
      ListFooterComponent={
        listings.data && listings.data.total > 0 ? (
          <View style={[s.row, { justifyContent: "center", paddingTop: 25 }]}>
            <Button
              title={t("back")}
              secondary
              disabled={filters.page === 1}
              onPress={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            />
            <Text>{filters.page}</Text>
            <Button
              title={t("more")}
              secondary
              disabled={!listings.data.hasMore}
              onPress={() => (
                setCursors((c) => [
                  ...c.slice(0, filters.page),
                  listings.data?.nextCursor || null,
                ]),
                setFilters((f) => ({ ...f, page: f.page + 1 }))
              )}
            />
          </View>
        ) : undefined
      }
    />
  );
}
