"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { api, phoneNumber } from "@/lib/api";
import { useLocale } from "./provider";
import { ErrorBox } from "./ui";
export function SignIn() {
  const { t } = useLocale();
  const cache = useQueryClient();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const action = useMutation({
    mutationFn: async () => {
      const number = phoneNumber(phone);
      if (!sent) {
        await api("/api/auth/phone-number/send-otp", "POST", {
          phoneNumber: number,
        });
        setSent(true);
      } else {
        await api("/api/auth/phone-number/verify", "POST", {
          phoneNumber: number,
          code,
        });
        await cache.cancelQueries();
        cache.clear();
        await cache.fetchQuery({
          queryKey: ["me"],
          queryFn: () => api("/v1/me"),
        });
        router.push("/account");
      }
    },
    retry: false,
  });
  return (
    <div className="auth-page">
      <div className="auth-aside">
        <p className="eyebrow">OFFERME · ADDIS ABABA</p>
        <h1>{t("welcome")}</h1>
        <p>{t("heroText")}</p>
        <ShieldCheck size={110} strokeWidth={1} />
        <p>{t("safety")}</p>
      </div>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate();
        }}
      >
        <span className="eyebrow">{t("local")}</span>
        <h2>{t("signin")}</h2>
        <p>{t("authText")}</p>
        <label>
          {t("phone")}
          <input
            type="tel"
            autoComplete="tel"
            placeholder="0912345678"
            value={phone}
            required
            disabled={sent || action.isPending}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        {sent && (
          <>
            <p>{t("sent")}</p>
            <label>
              {t("code")}
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </label>
          </>
        )}
        {action.error && <ErrorBox error={action.error} />}
        <button className="button primary" disabled={action.isPending}>
          {action.isPending ? t("loading") : sent ? t("verify") : t("sendCode")}
          <ArrowRight size={18} />
        </button>
        {sent && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSent(false);
              setCode("");
              action.reset();
            }}
          >
            {t("back")}
          </button>
        )}
      </form>
    </div>
  );
}
