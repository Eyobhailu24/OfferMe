import type { Metadata } from "next";
import { Providers } from "@/components/provider";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://127.0.0.1:3100"),
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
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
