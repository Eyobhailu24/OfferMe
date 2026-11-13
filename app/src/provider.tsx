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
  focusManager,
} from "@tanstack/react-query";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { translate } from "../locale";
import type { Locale, User } from "../types";
import { api, ApiError } from "./api";
import { LocalSync } from "./sync";
const Context = createContext({
  locale: "en" as Locale,
  setLocale: (_value: Locale) => {},
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
          queries: { staleTime: 15000, retry: 1 },
          mutations: { retry: false },
        },
      }),
  );
  const [locale, setValue] = useState<Locale>("en");
  useEffect(() => {
    void SecureStore.getItemAsync("offerme-language")
      .then((v) => {
        if (v === "am" || v === "om") setValue(v);
      })
      .catch(() => {});
    const sub = AppState.addEventListener("change", (s) =>
      focusManager.setFocused(s === "active"),
    );
    return () => sub.remove();
  }, []);
  const setLocale = (value: Locale) => {
    setValue(value);
    void SecureStore.setItemAsync("offerme-language", value).catch(() => {});
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
