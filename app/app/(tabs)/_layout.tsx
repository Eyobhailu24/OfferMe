import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocale } from "../../src/provider";
import { colors } from "../../src/ui";
export default function Layout() {
  const { t } = useLocale();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: "#829086",
        tabBarStyle: { borderTopColor: colors.line },
        headerTitleStyle: { color: colors.green, fontWeight: "800" },
      }}
    >
      {(
        [
          { name: "index", key: "browse", icon: "search" },
          { name: "saved", key: "saved", icon: "heart-outline" },
          { name: "sell", key: "sell", icon: "add-circle-outline" },
          { name: "messages", key: "messages", icon: "chatbubble-outline" },
          { name: "account", key: "account", icon: "person-outline" },
        ] as const
      ).map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.key),
            headerTitle:
              tab.name === "index" ? "offerme • Addis Ababa" : t(tab.key),
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name={tab.icon}
                size={size}
                color={typeof color === "string" ? color : colors.green}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
