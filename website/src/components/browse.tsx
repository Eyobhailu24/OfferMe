"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Search,
  ArrowUpRight,
  SlidersHorizontal,
  Smartphone,
  Armchair,
  Laptop,
  Shirt,
  Bike,
  BookOpen,
  Gamepad2,
  Wrench,
  Shapes,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Catalog, Page, Listing } from "@/lib/types";
import { useLocale, useUser } from "./provider";
import { Cards, Empty, ErrorBox, Loading, AuthGate } from "./ui";
import { SaveSearch } from "./save-search";
const icons: Record<string, typeof Shapes> = {
  phones: Smartphone,
  furniture: Armchair,
  electronics: Laptop,
  fashion: Shirt,
  sports: Bike,
  books: BookOpen,
  gaming: Gamepad2,
  tools: Wrench,
};
export function Browse() {
  const { t, locale } = useLocale();
  const user = useUser();
  const [q, setQ] = useState("");
  const [locationError, setLocationError] = useState<Error | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [filters, setFilters] = useState({
    latitude: "",
    longitude: "",
    radiusKm: "10",
    q: "",
    category: "",
    neighborhood: "",
    condition: "",
    min: "",
    max: "",
    sort: "recent",
    page: 1,
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.size) return;
    setFilters((f) => ({
      ...f,
      ...Object.fromEntries(
        ["q", "category", "neighborhood", "condition", "min", "max"]
          .filter((k) => params.has(k))
          .map((k) => [
            k,
            ["min", "max"].includes(k)
              ? String(Number(params.get(k)) / 100)
              : params.get(k)!,
          ]),
      ),
      page: 1,
    }));
    setQ(params.get("q") || "");
  }, []);
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/v1/catalog"),
    staleTime: Infinity,
  });
  const query = new URLSearchParams(
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
    query.set("cursor", cursors[filters.page - 1]!);
  const listings = useQuery({
    queryKey: ["listings", query.toString()],
    queryFn: () => api<Page>("/v1/listings?" + query),
  });
  const saved = useQuery({
    queryKey: ["saved"],
    queryFn: () => api<{ items: Listing[] }>("/v1/favorites"),
    enabled: !!user.data,
  });
  const update = (key: string, value: string) => (
    setCursors([null]),
    setFilters((f) => ({ ...f, [key]: value, page: 1 }))
  );
  return (
    <div className="page">
      <button
        onClick={() =>
          navigator.geolocation
            ? navigator.geolocation.getCurrentPosition(
                (point) => {
                  setCursors([null]);
                  setFilters((f) => ({
                    ...f,
                    latitude: String(point.coords.latitude),
                    longitude: String(point.coords.longitude),
                    page: 1,
                  }));
                },
                () =>
                  setLocationError(
                    new Error(
                      "Location permission was not granted. Select a neighborhood manually.",
                    ),
                  ),
              )
            : setLocationError(new Error("Select a neighborhood manually."))
        }
      >
        {t("nearby")}
      </button>
      {locationError && <ErrorBox error={locationError} />}{" "}
      {filters.latitude && (
        <button
          onClick={() => {
            setCursors([null]);
            setFilters((f) => ({ ...f, latitude: "", longitude: "", page: 1 }));
          }}
        >
          {t("removeLocation")}
        </button>
      )}
      <SaveSearch query={query} />
      <section className="hero">
        <div>
          <p className="eyebrow">
            <span /> {t("local")}
          </p>
          <h1>{t("hero")}</h1>
          <p className="hero-copy">{t("heroText")}</p>
          <form
            className="search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              update("q", q);
            }}
          >
            <Search size={21} />
            <input
              aria-label={t("search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search")}
            />
            <button className="button primary" type="submit">
              {t("searchButton")}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="hero-location">
            <MapPin size={15} />
            {t("anywhere")} <span>· {t("noDelivery")}</span>
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-circle" />
          <div className="art-ticket">
            <span>{t("secondHand")}</span>
            <strong>{t("firstChoice")}</strong>
            <Armchair size={86} strokeWidth={1.2} />
            <span>{t("addis")}</span>
          </div>
          <div className="art-tag">
            {t("lessNew")}
            <br />A lot more possibility.
          </div>
          <div className="art-star">✳</div>
        </div>
      </section>
      <section className="category-section" aria-label={t("category")}>
        <button
          className={"category " + (!filters.category ? "chosen" : "")}
          onClick={() => update("category", "")}
        >
          <Shapes size={25} />
          <span>{t("all")}</span>
        </button>
        {catalog.data?.categories.map((c) => {
          const Icon = icons[c.id] || Shapes;
          return (
            <button
              key={c.id}
              className={
                "category " + (filters.category === c.id ? "chosen" : "")
              }
              onClick={() => update("category", c.id)}
            >
              <Icon size={25} />
              <span>{locale === "en" ? c.name : c[locale]}</span>
            </button>
          );
        })}
      </section>
      <section className="market-section">
        <aside className="filters">
          <h3>
            <SlidersHorizontal size={17} /> {t("searchButton")}
          </h3>
          <label>
            {t("neighborhood")}
            <select
              value={filters.neighborhood}
              onChange={(e) => update("neighborhood", e.target.value)}
            >
              <option value="">{t("anywhere")}</option>
              {catalog.data?.neighborhoods.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            {t("condition")}
            <select
              value={filters.condition}
              onChange={(e) => update("condition", e.target.value)}
            >
              <option value="">{t("anyCondition")}</option>
              {catalog.data?.conditions.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("min")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={filters.min}
              onChange={(e) => update("min", e.target.value)}
            />
          </label>
          <label>
            {t("max")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={filters.max}
              onChange={(e) => update("max", e.target.value)}
            />
          </label>
          <button
            className="text-button"
            onClick={() => {
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
                min: "",
                max: "",
                sort: "recent",
                page: 1,
              });
            }}
          >
            {t("clear")}
          </button>
          <div className="aside-note">
            <span>↗</span>
            <h3>{t("sell")}</h3>
            <p>{t("heroText")}</p>
            <Link href="/sell">
              {t("sell")} <ArrowUpRight size={18} />
            </Link>
          </div>
        </aside>
        <div className="results">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("addisFinds")}</p>
              <h2>{t("fresh")}</h2>
              {listings.data && (
                <small>
                  {listings.data.total} {t("active").toLowerCase()}
                </small>
              )}
            </div>
            <select
              aria-label="Sort listings"
              value={filters.sort}
              onChange={(e) => update("sort", e.target.value)}
            >
              <option value="recent">{t("recent")}</option>
              <option value="price_low">{t("low")}</option>
              <option value="price_high">{t("high")}</option>
            </select>
          </div>
          {catalog.error && (
            <ErrorBox error={catalog.error} retry={() => catalog.refetch()} />
          )}{" "}
          {listings.isPending ? (
            <Loading />
          ) : listings.error ? (
            <ErrorBox error={listings.error} retry={() => listings.refetch()} />
          ) : !listings.data.items.length ? (
            <Empty />
          ) : (
            <>
              <Cards
                items={listings.data.items}
                savedIds={saved.data?.items.map((i) => i.id)}
              />
              <div className="pagination">
                <button
                  disabled={filters.page === 1}
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: f.page - 1 }))
                  }
                >
                  {t("back")}
                </button>
                <span>{filters.page}</span>
                <button
                  disabled={!listings.data.hasMore}
                  onClick={() => (
                    setCursors((c) => [
                      ...c.slice(0, filters.page),
                      listings.data?.nextCursor || null,
                    ]),
                    setFilters((f) => ({ ...f, page: f.page + 1 }))
                  )}
                >
                  {t("more")}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
export function Saved() {
  const { t } = useLocale();
  const user = useUser();
  const saved = useQuery({
    queryKey: ["saved"],
    queryFn: () => api<{ items: Listing[] }>("/v1/favorites"),
    enabled: !!user.data,
  });
  return (
    <AuthGate>
      <div className="page">
        <h1>{t("saved")}</h1>
        {saved.isPending ? (
          <Loading />
        ) : saved.error ? (
          <ErrorBox error={saved.error} retry={() => saved.refetch()} />
        ) : saved.data.items.length ? (
          <Cards
            items={saved.data.items}
            savedIds={saved.data.items.map((i) => i.id)}
          />
        ) : (
          <Empty />
        )}
      </div>
    </AuthGate>
  );
}
