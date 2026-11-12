import { useLocalSearchParams } from "expo-router";
import { Sell } from "../../src/sell";
export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Sell id={id} />;
}
