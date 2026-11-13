"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocale } from "./provider";
import { ErrorBox } from "./ui";
type Ticket = {
  id: string;
  kind: string;
  body: string;
  status: string;
  response: string | null;
  user_id: string;
  name: string;
};
export function AccountTools() {
  const { t, locale } = useLocale();
  const cache = useQueryClient();
  const [kind, setKind] = useState("support"),
    [body, setBody] = useState("");
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ pushEnabled: boolean }>("/v1/me/settings"),
  });
  const blocks = useQuery({
    queryKey: ["blocks"],
    queryFn: () => api<{ items: { id: string; name: string }[] }>("/v1/blocks"),
  });
  const searches = useQuery({
    queryKey: ["searches"],
    queryFn: () =>
      api<{
        items: {
          id: string;
          name: string;
          filters: Record<string, string | number>;
        }[];
      }>("/v1/saved-searches"),
  });
  const tickets = useQuery({
    queryKey: ["support"],
    queryFn: () => api<{ items: Ticket[] }>("/v1/support"),
  });
  const action = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      data = {},
    }: {
      path: string;
      method?: string;
      data?: unknown;
    }) => api(path, method, data),
    onSuccess: async () => {
      for (const key of ["settings", "blocks", "searches", "support"])
        await cache.invalidateQueries({ queryKey: [key] });
    },
  });
  const exportData = useMutation({
    mutationFn: async () => {
      const data = await api("/v1/me/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "offerme-account-export.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return (
    <section>
      <h2>{t("settings")}</h2>
      {settings.data && (
        <label>
          <input
            type="checkbox"
            checked={settings.data.pushEnabled}
            disabled={action.isPending}
            onChange={(e) =>
              action.mutate({
                path: "/v1/me/settings",
                method: "PATCH",
                data: { locale, pushEnabled: e.target.checked },
              })
            }
          />
          {t("pushEnabled")}
        </label>
      )}
      <h3>{t("blockedPeople")}</h3>
      {blocks.data?.items.map((b) => (
        <p key={b.id}>
          {b.name}{" "}
          <button
            disabled={action.isPending}
            onClick={() =>
              action.mutate({ path: "/v1/blocks/" + b.id, method: "DELETE" })
            }
          >
            {t("unblock")}
          </button>
        </p>
      ))}
      <h3>{t("savedSearches")}</h3>
      {searches.data?.items.map((s) => (
        <p key={s.id}>
          <Link
            href={
              "/?" +
              new URLSearchParams(
                Object.entries(s.filters).map(([k, v]) => [k, String(v)]),
              )
            }
          >
            {s.name}
          </Link>{" "}
          <button
            disabled={action.isPending}
            onClick={() =>
              action.mutate({
                path: "/v1/saved-searches/" + s.id,
                method: "DELETE",
              })
            }
          >
            {t("delete")}
          </button>
        </p>
      ))}
      <form
        className="profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate({ path: "/v1/support", data: { kind, body } });
        }}
      >
        <h3>{t("support")}</h3>
        <label>
          {t("support")}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["support", "recovery", "appeal"].map((v) => (
              <option value={v} key={v}>
                {t(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("reason")}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={15}
            maxLength={4000}
            required
          />
        </label>
        <button disabled={action.isPending}>{t("submit")}</button>
      </form>
      {tickets.data?.items.map((ticket) => (
        <article className="event-card" key={ticket.id}>
          <strong>
            {t(ticket.kind)} - {t(ticket.status)}
          </strong>
          <p>{ticket.body}</p>
          {ticket.response && <p>{ticket.response}</p>}
        </article>
      ))}
      <div className="button-row">
        <button
          disabled={exportData.isPending}
          onClick={() => exportData.mutate()}
        >
          {t("exportData")}
        </button>
        <button
          disabled={action.isPending}
          onClick={() => {
            if (window.confirm(t("deletionNotice")))
              action.mutate({ path: "/v1/me/deletion" });
          }}
        >
          {t("deletionRequest")}
        </button>
      </div>
      {[
        action.error,
        exportData.error,
        settings.error,
        blocks.error,
        searches.error,
        tickets.error,
      ]
        .filter(Boolean)
        .map((e, i) => (
          <ErrorBox key={i} error={e} />
        ))}
    </section>
  );
}
export function SupportQueue() {
  const { t } = useLocale();
  const cache = useQueryClient();
  const tickets = useQuery({
    queryKey: ["admin-support"],
    queryFn: () => api<{ items: Ticket[] }>("/v1/admin/support"),
  });
  const action = useMutation({
    mutationFn: ({ path, data }: { path: string; data: unknown }) =>
      api(path, "PATCH", data),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["admin-support"] }),
  });
  return (
    <section>
      <h2>{t("support")}</h2>
      {tickets.data?.items.map((ticket) => (
        <article className="event-card" key={ticket.id}>
          <h3>
            {ticket.name} - {t(ticket.kind)} - {t(ticket.status)}
          </h3>
          <p>{ticket.body}</p>
          {ticket.response && <p>{ticket.response}</p>}
          {ticket.status === "open" && (
            <button
              disabled={action.isPending}
              onClick={() => {
                const response = window.prompt(t("reason"));
                if (response && response.trim().length >= 10)
                  action.mutate({
                    path: "/v1/admin/support/" + ticket.id,
                    data: { status: "resolved", response },
                  });
              }}
            >
              {t("resolve")}
            </button>
          )}
          <button
            disabled={action.isPending}
            onClick={() => {
              const reason = window.prompt(t("reason"));
              if (reason && reason.trim().length >= 10)
                action.mutate({
                  path: "/v1/admin/users/" + ticket.user_id,
                  data: { suspended: true, reason },
                });
            }}
          >
            {t("suspend")}
          </button>
          <button
            disabled={action.isPending}
            onClick={() => {
              const reason = window.prompt(t("reason"));
              if (reason && reason.trim().length >= 10)
                action.mutate({
                  path: "/v1/admin/users/" + ticket.user_id,
                  data: { suspended: false, reason },
                });
            }}
          >
            {t("restoreAccount")}
          </button>
        </article>
      ))}
      {(tickets.error || action.error) && (
        <ErrorBox error={tickets.error || action.error} />
      )}
    </section>
  );
}

export function AdminVerification() {
  const { t } = useLocale();
  const cache = useQueryClient();
  const [code, setCode] = useState("");
  const verify = useMutation({
    mutationFn: () => api("/v1/me/admin-verification", "POST", { code }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        verify.mutate();
      }}
    >
      <label>
        {t("adminCode")}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoComplete="one-time-code"
        />
      </label>
      <button disabled={verify.isPending}>{t("verify")}</button>
      {verify.error && <ErrorBox error={verify.error} />}
    </form>
  );
}
