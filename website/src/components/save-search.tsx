"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocale, useUser } from "./provider";
import { ErrorBox } from "./ui";
export function SaveSearch({ query }: { query: URLSearchParams }) {
  const { t } = useLocale();
  const user = useUser();
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: ({
      name,
      filters,
    }: {
      name: string;
      filters: Record<string, string | number>;
    }) => api("/v1/saved-searches", "POST", { name, filters }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["searches"] }),
  });
  if (!user.data) return null;
  return (
    <div>
      <button
        disabled={save.isPending}
        onClick={() => {
          const name = window.prompt(t("saveSearch"));
          if (!name) return;
          const filters: Record<string, string | number> = {};
          for (const [k, v] of query)
            if (
              [
                "q",
                "category",
                "neighborhood",
                "condition",
                "min",
                "max",
              ].includes(k) &&
              v
            )
              filters[k] = ["min", "max"].includes(k) ? Number(v) : v;
          save.mutate({ name, filters });
        }}
      >
        {t("saveSearch")}
      </button>
      {save.isSuccess && <span role="status">{t("save")}</span>}
      {save.error && <ErrorBox error={save.error} />}
    </div>
  );
}
