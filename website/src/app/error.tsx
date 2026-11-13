"use client";
import { useLocale } from "@/components/provider";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useLocale();
  return (
    <div className="empty">
      <h1>{t("generalError")}</h1>
      <button className="button primary" onClick={reset}>
        {t("retry")}
      </button>
    </div>
  );
}
