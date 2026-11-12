import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
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
  const [filters, setFilters] = useState({
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
  const listings = useQuery({
    queryKey: ["listings", search.toString()],
    queryFn: () => api<Page>("/v1/listings?" + search),
  });
  const update = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
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
                  setFilters({
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
              onPress={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            />
          </View>
        ) : undefined
      }
    />
  );
}
