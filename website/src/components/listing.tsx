"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  ShieldCheck,
  ArrowLeft,
  MessageCircle,
  Flag,
  Upload,
  X,
} from "lucide-react";
import { api, money } from "@/lib/api";
import type { Listing, Catalog } from "@/lib/types";
import { useLocale, useUser } from "./provider";
import { AuthGate, ErrorBox, Loading, SaveButton } from "./ui";
export function Detail({ id }: { id: string }) {
  const { t } = useLocale();
  const user = useUser();
  const router = useRouter();
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
  const contact = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/v1/conversations", "POST", { listingId: id }),
    onSuccess: (r) => router.push("/messages/" + r.id),
  });
  const reportAction = useMutation({
    mutationFn: () => api("/v1/reports", "POST", { listingId: id, reason }),
    onSuccess: () => setReason(""),
  });
  if (item.isPending) return <Loading />;
  if (item.error)
    return <ErrorBox error={item.error} retry={() => item.refetch()} />;
  const l = item.data;
  return (
    <div className="page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        {t("browse")}
      </Link>
      <div className="detail-grid">
        <section>
          <div className="detail-image">
            <img src={l.images[photo]} alt={l.title} />
            <SaveButton
              id={id}
              saved={saved.data?.items.some((i) => i.id === id)}
            />
          </div>
          <div className="thumbnails">
            {l.images.map((src, i) => (
              <button
                key={src}
                className={photo === i ? "selected" : ""}
                aria-label={"Photo " + (i + 1)}
                onClick={() => setPhoto(i)}
              >
                <img src={src} alt={l.title + " " + (i + 1)} />
              </button>
            ))}
          </div>
          <div className="detail-copy">
            <h2>{t("description")}</h2>
            <p className="preserve">{l.description}</p>
            <h3>{t("defects")}</h3>
            <p className="preserve">{l.defects}</p>
          </div>
        </section>
        <aside className="item-info">
          <span className="badge">{t(l.status)}</span>
          <h1>{l.title}</h1>
          <div className="item-price">{money(l.priceMinor)}</div>
          <p className="muted">{t(l.negotiable ? "negotiable" : "firm")}</p>
          <div className="item-facts">
            <span>
              <MapPin size={17} />
              {l.neighborhood}, Addis Ababa
            </span>
            <span>
              {t("condition")}: {t(l.condition)}
            </span>
          </div>
          <div className="seller">
            <span className="avatar">{l.sellerName?.slice(0, 1)}</span>
            <div>
              <strong>{l.sellerName}</strong>
              {l.sellerPhoneVerified && (
                <small>
                  <ShieldCheck size={14} />
                  {t("verified")}
                </small>
              )}
            </div>
          </div>
          {user.data?.id === l.sellerId ? (
            <Link className="button primary" href={"/sell?edit=" + id}>
              {t("edit")}
            </Link>
          ) : (
            <button
              className="button primary"
              disabled={contact.isPending || l.status !== "active"}
              onClick={() =>
                user.data ? contact.mutate() : router.push("/signin")
              }
            >
              <MessageCircle size={18} />
              {t("contact")}
            </button>
          )}
          {contact.error && <ErrorBox error={contact.error} />}
          <div className="safety-note">
            <ShieldCheck size={22} />
            <p>{t("safety")}</p>
          </div>
          <button
            className="text-button"
            onClick={() =>
              user.data ? setReport(!report) : router.push("/signin")
            }
          >
            <Flag size={15} />
            {t("report")}
          </button>
          {report && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                reportAction.mutate();
              }}
            >
              <label>
                {t("reason")}
                <textarea
                  minLength={10}
                  maxLength={1000}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button disabled={reportAction.isPending}>{t("submit")}</button>
              {reportAction.isSuccess && <p role="status">{t("reportSent")}</p>}
              {reportAction.error && <ErrorBox error={reportAction.error} />}
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
export function Sell({ id }: { id?: string }) {
  const user = useUser();
  const item = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api<Listing>("/v1/listings/" + id),
    enabled: !!id && !!user.data,
  });
  return (
    <AuthGate>
      {id && item.isPending ? (
        <Loading />
      ) : item.error ? (
        <ErrorBox error={item.error} />
      ) : (
        <ListingForm key={id || "new"} initial={item.data} />
      )}
    </AuthGate>
  );
}
function ListingForm({ initial }: { initial?: Listing }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const cache = useQueryClient();
  const user = useUser();
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/v1/catalog"),
    staleTime: Infinity,
  });
  const [images, setImages] = useState(initial?.images || []);
  const [imageError, setImageError] = useState<Error | null>(null);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    defects: initial?.defects || "",
    price: initial ? String(initial.priceMinor / 100) : "",
    categoryId: initial?.categoryId || "",
    condition: initial?.condition || "good",
    neighborhood: initial?.neighborhood || "",
    negotiable: initial?.negotiable ?? true,
  });
  const update = (key: string, value: string | boolean) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const publish = useMutation({
    mutationFn: () => {
      if (!images.length) throw new Error("Add at least one photo.");
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
      router.push("/items/" + r.id);
    },
  });
  async function upload(files: FileList | null) {
    if (!files) return;
    setImageError(null);
    if (images.length + files.length > 12) {
      setImageError(new Error("Choose up to 12 photos."));
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024)
          throw new Error("Photos must be under 8 MB.");
        const body = new FormData();
        body.append("file", file);
        const r = await api<{ url: string }>("/v1/media", "POST", body);
        setImages((v) => [...v, r.url]);
      }
    } catch (e) {
      setImageError(e as Error);
    } finally {
      setUploading(false);
    }
  }
  if (
    initial &&
    (initial.sellerId !== user.data?.id ||
      ["sold", "removed"].includes(initial.status))
  )
    return <ErrorBox error={new Error("This listing cannot be edited.")} />;
  return (
    <div className="form-page">
      <div className="form-heading">
        <p className="eyebrow">A NEW CHAPTER FOR YOUR THINGS</p>
        <h1>{t(initial ? "edit" : "sell")}</h1>
        <p>{t("noDelivery")}</p>
      </div>
      <form
        className="listing-form"
        onSubmit={(e) => {
          e.preventDefault();
          publish.mutate();
        }}
      >
        <section>
          <h2>
            01 <span>{t("photos")}</span>
          </h2>
          <p className="muted">JPG, PNG, WebP · 8 MB · 1–12</p>
          <div className="photo-editor">
            {images.map((src, i) => (
              <div key={src}>
                <img src={src} alt={"Listing photo " + (i + 1)} />
                <button
                  type="button"
                  aria-label={"Remove photo " + (i + 1)}
                  onClick={() => setImages(images.filter((s) => s !== src))}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <label className="upload-box">
              <Upload size={27} />
              {uploading ? t("loading") : t("addPhotos")}
              <input
                aria-label={t("addPhotos")}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading || images.length >= 12}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {imageError && <ErrorBox error={imageError} />}
        </section>
        <section>
          <h2>
            02 <span>{t("description")}</span>
          </h2>
          <label>
            {t("title")}
            <input
              value={draft.title}
              minLength={4}
              maxLength={100}
              required
              onChange={(e) => update("title", e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              {t("category")}
              <select
                required
                value={draft.categoryId}
                onChange={(e) => update("categoryId", e.target.value)}
              >
                <option value="">—</option>
                {catalog.data?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === "en" ? c.name : c[locale]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("condition")}
              <select
                value={draft.condition}
                onChange={(e) => update("condition", e.target.value)}
              >
                {catalog.data?.conditions.map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {t("description")}
            <textarea
              minLength={15}
              maxLength={4000}
              required
              value={draft.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </label>
          <label>
            {t("defects")}
            <textarea
              minLength={2}
              maxLength={1000}
              required
              value={draft.defects}
              onChange={(e) => update("defects", e.target.value)}
            />
          </label>
        </section>
        <section>
          <h2>
            03{" "}
            <span>
              {t("price")} & {t("neighborhood")}
            </span>
          </h2>
          <div className="form-row">
            <label>
              {t("price")}
              <input
                type="number"
                min={0}
                max={20000000}
                step="0.01"
                required
                value={draft.price}
                onChange={(e) => update("price", e.target.value)}
              />
            </label>
            <label>
              {t("neighborhood")}
              <select
                required
                value={draft.neighborhood}
                onChange={(e) => update("neighborhood", e.target.value)}
              >
                <option value="">—</option>
                {catalog.data?.neighborhoods.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.negotiable}
              onChange={(e) => update("negotiable", e.target.checked)}
            />
            {t("negotiable")}
          </label>
          <p className="safety-note">{t("safety")}</p>
        </section>
        {catalog.error && (
          <ErrorBox error={catalog.error} retry={() => catalog.refetch()} />
        )}{" "}
        {publish.error && <ErrorBox error={publish.error} />}
        <button
          className="button primary wide"
          disabled={publish.isPending || uploading || !catalog.data}
        >
          {publish.isPending ? t("loading") : t(initial ? "save" : "publish")}
        </button>
      </form>
    </div>
  );
}
