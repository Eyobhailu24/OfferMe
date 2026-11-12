import { useState } from "react";
import { Text, View, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { auth, phoneNumber } from "../src/api";
import { useLocale } from "../src/provider";
import { Button, Field, ErrorBox, Screen, s } from "../src/ui";
export default function SignIn() {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const action = useMutation({
    mutationFn: async () => {
      const number = phoneNumber(phone);
      const result = sent
        ? await auth.phoneNumber.verify({ phoneNumber: number, code })
        : await auth.phoneNumber.sendOtp({ phoneNumber: number });
      if (result.error)
        throw new Error(result.error.message || "Please try again.");
      if (sent) {
        await cache.invalidateQueries({ queryKey: ["me"] });
        router.replace("/account");
      } else setSent(true);
    },
  });
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen>
        <View style={s.hero}>
          <Text style={s.eyebrow}>OFFERME</Text>
          <Text style={s.heading}>{t("welcome")}</Text>
          <Text style={s.body}>{t("authText")}</Text>
        </View>
        <Field
          label={t("phone")}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="0912345678"
          value={phone}
          onChangeText={setPhone}
          editable={!sent && !action.isPending}
        />
        {sent && (
          <>
            <Text style={s.muted}>{t("sent")}</Text>
            <Field
              label={t("code")}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              value={code}
              maxLength={6}
              onChangeText={setCode}
            />
          </>
        )}
        {action.error && <ErrorBox error={action.error} />}
        <Button
          title={
            action.isPending ? t("loading") : t(sent ? "verify" : "sendCode")
          }
          disabled={action.isPending || (sent && code.length !== 6)}
          onPress={() => action.mutate()}
        />
        {sent && (
          <Button
            title={t("back")}
            secondary
            onPress={() => {
              setSent(false);
              setCode("");
              action.reset();
            }}
          />
        )}
        <Text style={s.muted}>{t("safety")}</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
