"use client";
import { useLocale } from "@/components/provider";
export default function Safety() {
  const { t } = useLocale();
  return (
    <article className="page">
      <h1>{t("safetyTitle")}</h1>
      {[
        "safetyInspect",
        "safetyPayment",
        "verificationNotice",
        "exchangeNotice",
        "safetyRules",
        "safetyReport",
      ].map((key) => (
        <p key={key}>{t(key)}</p>
      ))}
    </article>
  );
}
