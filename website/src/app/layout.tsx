import type { Metadata } from "next";
import { Providers } from "@/components/provider";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "OFFERME — Your neighborhood marketplace in Addis Ababa",
    template: "%s | OFFERME",
  },
  description:
    "Buy and sell pre-loved items in Addis Ababa. Chat, meet locally, inspect, and pay the seller directly.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
