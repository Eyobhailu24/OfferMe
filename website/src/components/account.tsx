"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, money } from "@/lib/api";
import type { Listing } from "@/lib/types";
import { useLocale, useUser, SignOut } from "./provider";
import { AuthGate, Empty, ErrorBox, Loading } from "./ui";
import { AccountTools, SupportQueue, AdminVerification } from "./account-tools";
import { Sales } from "./exchanges";
export function Account() {
  const { t } = useLocale();
  const user = useUser();
  return (
    <AuthGate>
      <div className="page account-page">
        <div className="section-heading">
          <h1>{t("account")}</h1>
          <SignOut>{t("signout")}</SignOut>
        </div>
        {user.data && <Profile key={user.data.id} name={user.data.name} />}
        <MyListings />
        <Sales />
        <AccountTools />
        {user.data?.admin &&
          (user.data.adminMfaRequired && !user.data.adminVerified ? (
            <AdminVerification />
          ) : (
            <>
              <Moderation />
              <SupportQueue />
            </>
          ))}
      </div>
    </AuthGate>
  );
}
function Profile({ name }: { name: string }) {
  const { t } = useLocale();
  const [value, setValue] = useState(name);
  const cache = useQueryClient();
  const update = useMutation({
    mutationFn: () => api("/v1/me", "PATCH", { name: value }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate();
      }}
    >
      <label>
        {t("name")}
        <input
          value={value}
          minLength={2}
          maxLength={50}
          required
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button className="button primary" disabled={update.isPending}>
        {t("save")}
      </button>
      {update.isSuccess && <span role="status">✓ {t("save")}</span>}
      {update.error && <ErrorBox error={update.error} />}
    </form>
  );
}
function MyListings() {
  const { t } = useLocale();
  const cache = useQueryClient();
  const mine = useQuery({
    queryKey: ["mine"],
    queryFn: () => api<{ items: Listing[] }>("/v1/listings/mine"),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api("/v1/listings/" + id + "/status", "PATCH", { status }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["mine"] });
      await cache.invalidateQueries({ queryKey: ["listings"] });
      await cache.invalidateQueries({ queryKey: ["listing"] });
    },
  });
  return (
    <section>
      <div className="section-heading">
        <h2>{t("selling")}</h2>
        <Link className="button primary" href="/sell">
          + {t("sell")}
        </Link>
      </div>
      {update.error && <ErrorBox error={update.error} />}{" "}
      {mine.isPending ? (
        <Loading />
      ) : mine.error ? (
        <ErrorBox error={mine.error} retry={() => mine.refetch()} />
      ) : !mine.data.items.length ? (
        <Empty />
      ) : (
        mine.data.items.map((l) => (
          <article key={l.id} className="manage-item">
            <Link href={"/items/" + l.id}>
              <img src={l.images[0]} alt={l.title} />
            </Link>
            <div>
              <h3>
                <Link href={"/items/" + l.id}>{l.title}</Link>
              </h3>
              <strong>{money(l.priceMinor)}</strong>
              <span className="badge">{t(l.status)}</span>
              {!["sold", "removed"].includes(l.status) && (
                <div className="button-row">
                  <Link href={"/sell?edit=" + l.id}>{t("edit")}</Link>
                  <button
                    disabled={update.isPending}
                    onClick={() => {
                      if (window.confirm(t("confirmSold")))
                        update.mutate({ id: l.id, status: "sold" });
                    }}
                  >
                    {t("markOutside")}
                  </button>
                  <button
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        id: l.id,
                        status: l.status === "archived" ? "active" : "archived",
                      })
                    }
                  >
                    {t(l.status === "archived" ? "restore" : "archive")}
                  </button>
                  {l.status === "reserved" && (
                    <button
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: l.id, status: "active" })
                      }
                    >
                      {t("restore")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
function Moderation() {
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const { t } = useLocale();
  const cache = useQueryClient();
  const reports = useQuery({
    queryKey: ["reports"],
    queryFn: () =>
      api<{
        items: {
          id: string;
          listingId?: string;
          listingStatus?: string;
          reason: string;
          status: string;
        }[];
      }>("/v1/admin/reports"),
  });
  const action = useMutation({
    mutationFn: ({ path, data }: { path: string; data?: unknown }) =>
      api(path, "PATCH", data),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["reports"] }),
  });
  return (
    <section>
      <h2>{t("moderation")}</h2>
      {selectedCase && <ReportDetails id={selectedCase} />}
      {action.error && <ErrorBox error={action.error} />}{" "}
      {reports.error && <ErrorBox error={reports.error} />}{" "}
      {reports.data?.items.map((r) => (
        <article className="event-card" key={r.id}>
          <p>{r.reason}</p>
          <button onClick={() => setSelectedCase(r.id)}>
            {t("caseDetails")}
          </button>
          <span>{r.status}</span>
          {r.listingId && (
            <Link href={"/items/" + r.listingId}>{t("viewListing")}</Link>
          )}
          {r.status === "open" && (
            <div className="button-row">
              {["resolved", "dismissed"].map((status) => (
                <button
                  disabled={action.isPending}
                  key={status}
                  onClick={() =>
                    action.mutate({
                      path: "/v1/admin/reports/" + r.id,
                      data: { status },
                    })
                  }
                >
                  {t(status)}
                </button>
              ))}
              {r.listingId && (
                <button
                  disabled={action.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          r.listingStatus === "removed"
                            ? "restore"
                            : "removeListing",
                        ),
                      )
                    )
                      action.mutate({
                        path:
                          "/v1/admin/listings/" +
                          r.listingId +
                          (r.listingStatus === "removed" ? "/restore" : ""),
                      });
                  }}
                >
                  {t(
                    r.listingStatus === "removed" ? "restore" : "removeListing",
                  )}
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function ReportDetails({ id }: { id: string }) {
  const action = useMutation({
    mutationFn: ({
      reviewId,
      hidden,
      reason,
    }: {
      reviewId: string;
      hidden: boolean;
      reason: string;
    }) => api("/v1/admin/reviews/" + reviewId, "PATCH", { hidden, reason }),
  });
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ["report-case", id],
    queryFn: () =>
      api<{
        reason: string;
        reviewId: string | null;
        reportedName: string | null;
        messageBody: string | null;
        reviewBody: string | null;
      }>("/v1/admin/reports/" + id),
  });
  return (
    <article className="event-card">
      <h3>{t("caseDetails")}</h3>
      {query.data && (
        <>
          <strong>{query.data.reportedName}</strong>
          <p>{query.data.reason}</p>
          {query.data.messageBody && (
            <blockquote>{query.data.messageBody}</blockquote>
          )}
          {query.data.reviewId && (
            <div className="button-row">
              {[true, false].map((hidden) => (
                <button
                  disabled={action.isPending}
                  key={String(hidden)}
                  onClick={() => {
                    const reason = window.prompt(t("reason"));
                    if (reason && reason.trim().length >= 10)
                      action.mutate({
                        reviewId: query.data!.reviewId!,
                        hidden,
                        reason,
                      });
                  }}
                >
                  {t(hidden ? "hideReview" : "restoreReview")}
                </button>
              ))}
            </div>
          )}
          {query.data.reviewBody && (
            <blockquote>{query.data.reviewBody}</blockquote>
          )}
        </>
      )}
      {(query.error || action.error) && (
        <ErrorBox error={query.error || action.error} />
      )}
    </article>
  );
}
