"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Message } from "@/lib/types";
import { useLocale, useUser } from "./provider";
import { ErrorBox } from "./ui";
export function ReportControl({
  userId,
  reviewId,
  messages = [],
}: {
  userId?: string;
  reviewId?: string;
  messages?: Message[];
}) {
  const { t } = useLocale();
  const user = useUser();
  const [reason, setReason] = useState(""),
    [messageId, setMessageId] = useState("");
  const report = useMutation({
    mutationFn: () =>
      api("/v1/reports", "POST", {
        userId,
        reviewId,
        messageId: messageId || undefined,
        reason,
      }),
  });
  if (!user.data)
    return (
      <Link href="/signin">
        {t(reviewId ? "reportReview" : "reportPerson")}
      </Link>
    );
  return (
    <details>
      <summary>{t(reviewId ? "reportReview" : "reportPerson")}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          report.mutate();
        }}
      >
        {!reviewId && (
          <label>
            {t("reportMessage")}
            <select
              value={messageId}
              onChange={(e) => setMessageId(e.target.value)}
            >
              <option value="">{t("reportPerson")}</option>
              {messages
                .filter((m) => m.senderId === userId)
                .slice(-20)
                .map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.body.slice(0, 80)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          {t("reason")}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={10}
            maxLength={1000}
            required
          />
        </label>
        <button disabled={report.isPending}>{t("submit")}</button>
        {report.isSuccess && <p role="status">{t("reportSent")}</p>}
        {report.error && <ErrorBox error={report.error} />}
      </form>
    </details>
  );
}
