import { FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../src/api";
import type { Listing } from "../../types";
import { useUser } from "../../src/provider";
import { Empty, ErrorBox, Gate, ListingCard, Loading, s } from "../../src/ui";
export default function Saved() {
  const user = useUser();
  const saved = useQuery({
    queryKey: ["saved"],
    queryFn: () => api<{ items: Listing[] }>("/v1/favorites"),
    enabled: !!user.data,
  });
  return (
    <Gate>
      <FlatList
        style={s.screen}
        contentContainerStyle={{ padding: 14 }}
        data={saved.data?.items || []}
        numColumns={2}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ListingCard item={item} />}
        refreshing={saved.isRefetching}
        onRefresh={() => saved.refetch()}
        ListEmptyComponent={
          saved.isPending ? (
            <Loading />
          ) : saved.error ? (
            <ErrorBox error={saved.error} retry={() => saved.refetch()} />
          ) : (
            <Empty />
          )
        }
      />
    </Gate>
  );
}
