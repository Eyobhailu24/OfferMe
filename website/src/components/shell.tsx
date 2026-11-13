"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  MessageCircle,
  Plus,
  MapPin,
  UserRound,
  ArrowUpRight,
  Store,
} from "lucide-react";
import { useLocale, useUser } from "./provider";
import type { Locale } from "@/lib/types";
export function Shell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useLocale();
  const user = useUser();
  const path = usePathname();
  return (
    <>
      <a className="skip" href="#main">
        {t("skipContent")}
      </a>
      <div className="utility">
        <span>
          <MapPin size={13} /> {t("addisEthiopia")}
        </span>
        <span>{t("noDelivery")}</span>
        <select
          aria-label="Language"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          <option value="en">English</option>
          <option value="am">አማርኛ</option>
          <option value="om">Afaan Oromo</option>
        </select>
      </div>
      <header className="header">
        <Link href="/" className="logo" aria-label={t("home")}>
          <span className="logo-icon">
            <Store size={24} />
          </span>
          offer<span>me</span>
          <i>•</i>
        </Link>
        <nav aria-label={t("navigation")}>
          <Link className={path === "/" ? "selected" : ""} href="/">
            {t("browse")}
          </Link>
          <Link href="/saved">
            <Heart size={19} />
            <span>{t("saved")}</span>
          </Link>
          <Link href="/messages">
            <MessageCircle size={19} />
            <span>{t("messages")}</span>
          </Link>
          <Link href={user.data ? "/account" : "/signin"}>
            <UserRound size={19} />
            <span>{user.data ? t("account") : t("signin")}</span>
          </Link>
        </nav>
        <Link className="button primary sell-link" href="/sell">
          <Plus size={18} />
          {t("sell")}
        </Link>
      </header>
      <main id="main">{children}</main>
      <footer>
        <Link className="logo" href="/">
          offer<span>me</span>
          <i>•</i>
        </Link>
        <p>{t("noDelivery")}</p>
        <Link href="/safety">
          {t("safety")} <ArrowUpRight size={16} />
        </Link>
        <small>© {new Date().getFullYear()} OFFERME · Addis Ababa</small>
      </footer>
    </>
  );
}
