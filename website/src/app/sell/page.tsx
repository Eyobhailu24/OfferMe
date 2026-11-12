import { Sell } from "@/components/listing";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  return <Sell id={edit} />;
}
