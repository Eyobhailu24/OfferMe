import { PushNavigation } from "../src/push-navigation";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Providers } from "../src/provider";
import { colors } from "../src/ui";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <Providers>
        <PushNavigation />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.green,
            headerTitleStyle: { fontWeight: "700" },
            headerBackButtonDisplayMode: "minimal",
            contentStyle: { backgroundColor: "white" },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="signin" options={{ title: "OFFERME" }} />
          <Stack.Screen name="items/[id]" options={{ title: "OFFERME" }} />
          <Stack.Screen name="chat/[id]" options={{ title: "OFFERME" }} />
          <Stack.Screen name="edit/[id]" options={{ title: "OFFERME" }} />
        </Stack>
      </Providers>
    </SafeAreaProvider>
  );
}
