import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View, Text, StyleSheet } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";

const MIDNIGHT = "#0A0E1A";
const GOLD = "#C9A84C";
const MUTED = "#7A8FA6";
const NAVY_BORDER = "#1E2D45";

function TabIcon({
  name,
  label,
  color,
  focused,
}: {
  name: string;
  label: string;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={tabStyles.iconContainer}>
      <IconSymbol name={name as any} size={22} color={color} />
      <Text style={[tabStyles.label, { color }]}>{label}</Text>
      {focused && <View style={[tabStyles.activeDot, { backgroundColor: GOLD }]} />}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 64 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: MUTED,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: MIDNIGHT,
          borderTopColor: NAVY_BORDER,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="house.fill" label="Home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="bubble.left.and.bubble.right.fill" label="Ask AI" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="doc.text.fill" label="Docs" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person.crop.circle.fill" label="Profile" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: 60,
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  activeDot: {
    position: "absolute",
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
