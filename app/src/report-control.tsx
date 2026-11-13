import { useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { api } from "./api";
import type { Message } from "../types";
import { useLocale, useUser } from "./provider";
import { Button, Choice, ErrorBox, Field, s } from "./ui";
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
    [messageId, setMessageId] = useState(""),
    [open, setOpen] = useState(false);
  const report = useMutation({
    mutationFn: () =>
      api("/v1/reports", "POST", {
        userId,
        reviewId,
        messageId: messageId || undefined,
        reason,
      }),
  });
  return (
    <View style={s.card}>
      <Button
        title={t(reviewId ? "reportReview" : "reportPerson")}
        secondary
        onPress={() => (user.data ? setOpen(!open) : router.push("/signin"))}
      />
      {open && (
        <>
          {!reviewId && (
            <Choice
              label={t("reportMessage")}
              value={messageId}
              onChange={setMessageId}
              options={[
                { value: "", label: t("reportPerson") },
                ...messages
                  .filter((m) => m.senderId === userId)
                  .slice(-20)
                  .map((m) => ({ value: m.id, label: m.body.slice(0, 60) })),
              ]}
            />
          )}
          <Field
            label={t("reason")}
            value={reason}
            onChangeText={setReason}
            maxLength={1000}
            multiline
          />
          <Button
            title={t("submit")}
            disabled={report.isPending || reason.trim().length < 10}
            onPress={() => report.mutate()}
          />
          {report.isSuccess && <Text style={s.body}>{t("reportSent")}</Text>}
          {report.error && <ErrorBox error={report.error} />}
        </>
      )}
    </View>
  );
}
