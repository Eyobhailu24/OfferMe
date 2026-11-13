"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { translate } from "@/lib/locale";
import type { Locale, User } from "@/lib/types";
import { LocalSync } from "./sync";
const Context = createContext({
  locale: "en" as Locale,
  setLocale: (_locale: Locale) => {},
  t: (key: string) => translate("en", key),
});
export const useLocale = () => useContext(Context);
export const useUser = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<User>("/v1/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
  });
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  const [locale, setValue] = useState<Locale>("en");
  useEffect(() => {
    const value = localStorage.getItem("offerme-language");
    if (value === "am" || value === "om") setValue(value);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = (value: Locale) => {
    setValue(value);
    localStorage.setItem("offerme-language", value);
  };
  return (
    <QueryClientProvider client={client}>
      <Context.Provider
        value={{ locale, setLocale, t: (key) => translate(locale, key) }}
      >
        <LocalSync />
        {children}
      </Context.Provider>
    </QueryClientProvider>
  );
}
export function SignOut({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  return (
    <button
      className="text-button"
      onClick={async () => {
        try {
          await api("/api/auth/sign-out", "POST", {});
          cache.clear();
          window.location.assign("/");
        } catch {
          window.alert("Could not sign out. Please try again.");
        }
      }}
    >
      {children}
    </button>
  );
}
