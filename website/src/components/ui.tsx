"use client";
import Link from "next/link";
import { Search, ArrowRight, MapPin, Heart, ShieldCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, money } from "@/lib/api";
import type { Listing } from "@/lib/types";
import { useLocale, useUser } from "./provider";
export function ErrorBox({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t } = useLocale();
  return (
    <div role="alert" className="error-box">
      {error instanceof Error ? error.message : "Could not load this page."}
      {retry && <button onClick={retry}>{t("retry")}</button>}
    </div>
  );
}
export function Loading() {
  const { t } = useLocale();
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {t("loading")}
    </div>
  );
}
export function Empty({ title, text }: { title?: string; text?: string }) {
  const { t } = useLocale();
  return (
    <div className="empty">
      <span className="empty-icon">
        <Search size={30} />
      </span>
      <h2>{title || t("empty")}</h2>
      <p>{text || t("emptyText")}</p>
      <Link href="/sell" className="button primary">
        {t("sell")}
        <ArrowRight size={17} />
      </Link>
    </div>
  );
}
export function AuthGate({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const { t } = useLocale();
  if (user.isPending) return <Loading />;
  if (user.error)
    return <ErrorBox error={user.error} retry={() => user.refetch()} />;
  if (!user.data)
    return (
      <div className="empty">
        <ShieldCheck size={36} />
        <h1>{t("signin")}</h1>
        <p>{t("authText")}</p>
        <Link className="button primary" href="/signin">
          {t("signin")}
        </Link>
      </div>
    );
  return children;
}
export function SaveButton({
  id,
  saved = false,
}: {
  id: string;
  saved?: boolean;
}) {
  const user = useUser();
  const cache = useQueryClient();
  const router = useRouter();
  const { t } = useLocale();
  const save = useMutation({
    mutationFn: () => api("/v1/favorites/" + id, saved ? "DELETE" : "POST"),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["saved"] }),
  });
  return (
    <>
      <button
        className={"save-button " + (saved ? "is-saved" : "")}
        aria-label={saved ? "Remove from saved" : t("save")}
        aria-pressed={saved}
        disabled={save.isPending}
        onClick={() => (user.data ? save.mutate() : router.push("/signin"))}
      >
        <Heart size={20} fill={saved ? "currentColor" : "none"} />
      </button>
      {save.error && <small role="alert">{save.error.message}</small>}
    </>
  );
}
export function Cards({
  items,
  savedIds = [],
}: {
  items: Listing[];
  savedIds?: string[];
}) {
  const { t } = useLocale();
  return (
    <div className="cards">
      {items.map((item) => (
        <article className="listing-card" key={item.id}>
          <div className="card-photo">
            <Link href={"/items/" + item.id}>
              <img src={item.images[0]} alt={item.title} loading="lazy" />
            </Link>
            <SaveButton id={item.id} saved={savedIds.includes(item.id)} />
            {item.status !== "active" && (
              <span className="badge card-badge">{t(item.status)}</span>
            )}
          </div>
          <Link href={"/items/" + item.id}>
            <strong>{money(item.priceMinor)}</strong>
            <h3>{item.title}</h3>
          </Link>
          <p>
            <MapPin size={13} />
            {item.neighborhood} <span>· {t(item.condition)}</span>
          </p>
          {item.demo && <small>Demonstration listing</small>}
        </article>
      ))}
    </div>
  );
}
