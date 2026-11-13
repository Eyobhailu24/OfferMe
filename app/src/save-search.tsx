import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useLocale, useUser } from "./provider";
import { Button, ErrorBox, Field } from "./ui";
export function SaveSearch({ query }: { query: URLSearchParams }) {
  const { t } = useLocale();
  const user = useUser();
  const cache = useQueryClient();
  const [name, setName] = useState(""),
    [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const filters: Record<string, string | number> = {};
      for (const [k, v] of query)
        if (
          ["q", "category", "neighborhood", "condition", "min", "max"].includes(
            k,
          ) &&
          v
        )
          filters[k] = ["min", "max"].includes(k) ? Number(v) : v;
      return api("/v1/saved-searches", "POST", { name, filters });
    },
    onSuccess: async () => {
      setOpen(false);
      setName("");
      await cache.invalidateQueries({ queryKey: ["searches"] });
    },
  });
  if (!user.data) return null;
  return (
    <View>
      <Button
        title={t("saveSearch")}
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Field
            label={t("saveSearch")}
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <Button
            title={t("save")}
            disabled={save.isPending || name.trim().length < 2}
            onPress={() => save.mutate()}
          />
        </>
      )}
      {save.error && <ErrorBox error={save.error} />}
    </View>
  );
}
