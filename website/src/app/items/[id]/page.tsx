import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Detail } from "@/components/listing";
import { getListing, siteUrl } from "@/lib/server-listing";
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing)
    return {
      title: "Listing unavailable",
      robots: { index: false, follow: false },
    };
  const url = new URL("/items/" + id, siteUrl).href;
  const description = listing.description.slice(0, 180);
  return {
    title: listing.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: listing.title,
      description,
      url,
      siteName: "OFFERME",
      images: listing.images
        .slice(0, 1)
        .map((path) => ({
          url: new URL(path, siteUrl).href,
          alt: listing.title,
        })),
    },
    twitter: {
      card: "summary_large_image",
      title: listing.title,
      description,
      images: listing.images
        .slice(0, 1)
        .map((path) => new URL(path, siteUrl).href),
    },
  };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  const publicListing = await getListing(id);
  const listing =
    publicListing || (await getListing(id, (await cookies()).toString()));
  if (!listing) notFound();
  return <Detail id={id} initial={listing} />;
}
