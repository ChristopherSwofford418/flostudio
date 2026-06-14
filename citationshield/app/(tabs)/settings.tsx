import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getSubscription, setSubscription, getUsage, FREE_SCAN_LIMIT, type SubscriptionData } from "@/lib/scan-store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColorScheme } from "@/hooks/use-color-scheme";
import AsyncStorage from "@react-native-async-storage/async-storage";

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  destructive,
  rightElement,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  rightElement?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed && onPress ? 0.75 : 1 },
      ]}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={[styles.rowLabel, { color: destructive ? colors.error : colors.foreground }]}>{label}</Text>
      {value && <Text style={[styles.rowValue, { color: colors.muted }]}>{value}</Text>}
      {rightElement}
      {onPress && !rightElement && <IconSymbol name="chevron.right" size={14} color={colors.muted} />}
    </Pressable>
  );
}

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return <Text style={[styles.sectionHeader, { color: colors.muted }]}>{title}</Text>;
}

export default function SettingsScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const [subscription, setSubState] = useState<SubscriptionData>({ tier: "free" });
  const [usage, setUsageState] = useState({ scansThisMonth: 0, monthYear: "" });

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const [sub, usageData] = await Promise.all([getSubscription(), getUsage()]);
    setSubState(sub);
    setUsageState(usageData);
  }

  async function handleRestoreOnboarding() {
    await AsyncStorage.removeItem("onboarding_complete");
    router.replace("/onboarding");
  }

  async function handleResetData() {
    Alert.alert(
      "Reset All Data",
      "This will delete all scan history. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.multiRemove([
              "citation_shield_scans",
              "citation_shield_usage",
              "citation_shield_subscription",
            ]);
            Alert.alert("Done", "All data has been reset.");
            loadData();
          },
        },
      ]
    );
  }

  const tierLabel = subscription.tier === "free" ? "Free" : subscription.tier === "pro" ? "Pro" : "Law Firm";
  const isFree = subscription.tier === "free";

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>

        {/* Subscription */}
        <SectionHeader title="SUBSCRIPTION" />
        <View style={[styles.subCard, { backgroundColor: isFree ? colors.surface : colors.primary + "18", borderColor: isFree ? colors.border : colors.primary }]}>
          <View style={styles.subCardRow}>
            <Text style={styles.subEmoji}>{isFree ? "🔓" : "⭐"}</Text>
            <View style={styles.subCardInfo}>
              <Text style={[styles.subTier, { color: colors.foreground }]}>{tierLabel} Plan</Text>
              {isFree && (
                <Text style={[styles.subDetail, { color: colors.muted }]}>
                  {Math.max(0, FREE_SCAN_LIMIT - usage.scansThisMonth)} of {FREE_SCAN_LIMIT} free scans remaining this month
                </Text>
              )}
              {!isFree && (
                <Text style={[styles.subDetail, { color: colors.muted }]}>Unlimited scans</Text>
              )}
            </View>
          </View>
          {isFree && (
            <Pressable
              onPress={() => router.push("/scan/paywall")}
              style={({ pressed }) => [styles.upgradeButton, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
            </Pressable>
          )}
        </View>

        {/* App */}
        <SectionHeader title="APP" />
        <View style={[styles.section, { borderColor: colors.border }]}>
          <SettingsRow
            icon="📋"
            label="View Onboarding"
            onPress={handleRestoreOnboarding}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="🌙"
            label="Appearance"
            value={colorScheme === "dark" ? "Dark" : "Light"}
          />
        </View>

        {/* Legal */}
        <SectionHeader title="LEGAL" />
        <View style={[styles.section, { borderColor: colors.border }]}>
          <SettingsRow
            icon="📄"
            label="Privacy Policy"
            onPress={() => Linking.openURL("https://citationshield.app/privacy")}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="📜"
            label="Terms of Service"
            onPress={() => Linking.openURL("https://citationshield.app/terms")}
          />
        </View>

        {/* Data */}
        <SectionHeader title="DATA" />
        <View style={[styles.section, { borderColor: colors.border }]}>
          <SettingsRow
            icon="🗑️"
            label="Reset All Data"
            destructive
            onPress={handleResetData}
          />
        </View>

        {/* Version */}
        <Text style={[styles.version, { color: colors.muted }]}>Citation Shield v1.0.0</Text>
        <Text style={[styles.version, { color: colors.muted }]}>© 2026 Citation Shield</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  rowIcon: {
    fontSize: 18,
    width: 24,
    textAlign: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  rowValue: {
    fontSize: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
  },
  subCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  subCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  subEmoji: {
    fontSize: 28,
  },
  subCardInfo: {
    flex: 1,
    gap: 2,
  },
  subTier: {
    fontSize: 16,
    fontWeight: "600",
  },
  subDetail: {
    fontSize: 13,
  },
  upgradeButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  upgradeButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  version: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
