import { formatError } from "../locale";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { router } from "expo-router";
import { useLocale, useUser } from "./provider";
import { imageUrl, money } from "./api";
import type { Listing } from "../types";
export const colors = {
  green: "#174d3e",
  ink: "#192c27",
  muted: "#68786e",
  cream: "#f4f3ed",
  line: "#e0e6df",
  orange: "#d8774e",
};
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 45, gap: 18 },
  heading: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -1,
  },
  h2: { fontSize: 20, fontWeight: "700", color: colors.ink },
  body: { fontSize: 14, lineHeight: 22, color: colors.ink },
  muted: { fontSize: 12, lineHeight: 19, color: colors.muted },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 7,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    color: colors.ink,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: 10,
    minHeight: 46,
    paddingVertical: 13,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  secondary: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryText: { color: colors.green },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 18,
    gap: 12,
  },
  hero: {
    backgroundColor: colors.cream,
    padding: 24,
    borderRadius: 18,
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.green,
    letterSpacing: 2,
  },
  badge: {
    fontSize: 11,
    color: colors.green,
    backgroundColor: "#eaf1e9",
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 5,
  },
  empty: { padding: 30, alignItems: "center", gap: 15 },
  error: {
    backgroundColor: "#fff0e9",
    color: "#81391f",
    padding: 15,
    borderRadius: 9,
    lineHeight: 21,
  },
  photo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.cream,
  },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 8 },
});
export function Button({
  title,
  onPress,
  disabled,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8a958d"
        {...props}
        style={[
          s.input,
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
      >
        {options.map((o) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: value === o.value }}
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              s.button,
              s.secondary,
              value === o.value && { backgroundColor: colors.green },
            ]}
          >
            <Text
              style={[
                s.buttonText,
                s.secondaryText,
                value === o.value && { color: "#fff" },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t, locale } = useLocale();
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="alert" style={s.error}>
        {formatError(
          locale,
          error instanceof Error ? error.message : "Something went wrong.",
        )}
      </Text>
      {retry && <Button title={t("retry")} onPress={retry} secondary />}
    </View>
  );
}
export function Loading() {
  const { t } = useLocale();
  return (
    <View style={s.empty}>
      <ActivityIndicator color={colors.green} />
      <Text style={s.muted}>{t("loading")}</Text>
    </View>
  );
}
export function Empty() {
  const { t } = useLocale();
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 45, color: colors.green }}>↗</Text>
      <Text style={s.h2}>{t("empty")}</Text>
      <Text style={[s.muted, { textAlign: "center" }]}>{t("emptyText")}</Text>
      <Button title={t("sell")} onPress={() => router.push("/sell")} />
    </View>
  );
}
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
export function Gate({ children }: { children: ReactNode }) {
  const user = useUser();
  const { t } = useLocale();
  if (user.isPending) return <Loading />;
  if (user.error)
    return (
      <Screen>
        <ErrorBox error={user.error} retry={() => user.refetch()} />
      </Screen>
    );
  if (!user.data)
    return (
      <Screen>
        <View style={s.hero}>
          <Text style={s.heading}>{t("welcome")}</Text>
          <Text style={s.body}>{t("authText")}</Text>
          <Button title={t("signin")} onPress={() => router.push("/signin")} />
        </View>
      </Screen>
    );
  return children;
}
export function ListingCard({ item }: { item: Listing }) {
  const [fallback, setFallback] = useState(false);
  const { t } = useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => router.push("/items/" + item.id)}
      style={{ flex: 1, gap: 8, maxWidth: "50%", padding: 6 }}
    >
      <Image
        source={{
          uri: imageUrl(
            fallback
              ? item.images[0]
              : item.images[0]?.replace(/\.webp$/, ".thumb.webp"),
          ),
        }}
        onError={() => setFallback(true)}
        style={s.photo}
        accessibilityLabel={item.title}
      />
      <Text style={{ fontSize: 19, fontWeight: "700", color: colors.ink }}>
        {money(item.priceMinor)}
      </Text>
      <Text style={s.body} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={s.muted}>
        {item.neighborhood} · {t(item.condition)}
      </Text>
      {item.status !== "active" && (
        <Text style={s.badge}>{t(item.status)}</Text>
      )}
    </Pressable>
  );
}
