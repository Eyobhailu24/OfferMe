"use client";
import Link from "next/link";
import { useLocale } from "@/components/provider";
export default function NotFound() {
  const { t } = useLocale();
  return (
    <div className="empty">
      <h1>{t("pageMissing")}</h1>
      <Link className="button primary" href="/">
        {t("home")}
      </Link>
    </div>
  );
}
