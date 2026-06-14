import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { setSubscription } from "@/lib/scan-store";
import { IconSymbol } from "@/components/ui/icon-symbol";

type Plan = {
  id: "pro" | "law_firm";
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted: boolean;
};

const PLANS: Plan[] = [
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For solo practitioners and small firms",
    features: [
      "Unlimited citation scans",
      "PDF, DOCX, and TXT support",
      "Full verification reports",
      "Export & share reports",
      "Priority processing",
    ],
    highlighted: true,
  },
  {
    id: "law_firm",
    name: "Law Firm",
    price: "$99",
    period: "/month",
    description: "For teams and large firms",
    features: [
      "Everything in Pro",
      "Up to 10 team members",
      "Bulk document scanning",
      "API access",
      "Dedicated support",
    ],
    highlighted: false,
  },
];

function PlanCard({ plan, selected, onSelect }: { plan: Plan; selected: boolean; onSelect: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.planCard,
        {
          backgroundColor: selected ? colors.primary + "12" : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {plan.highlighted && (
        <View style={[styles.popularBadge, { backgroundColor: colors.accent }]}>
          <Text style={styles.popularText}>MOST POPULAR</Text>
        </View>
      )}
      <View style={styles.planHeader}>
        <View>
          <Text style={[styles.planName, { color: colors.foreground }]}>{plan.name}</Text>
          <Text style={[styles.planDesc, { color: colors.muted }]}>{plan.description}</Text>
        </View>
        <View style={styles.planPriceContainer}>
          <Text style={[styles.planPrice, { color: colors.primary }]}>{plan.price}</Text>
          <Text style={[styles.planPeriod, { color: colors.muted }]}>{plan.period}</Text>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      {plan.features.map((f) => (
        <View key={f} style={styles.featureRow}>
          <IconSymbol name="checkmark.circle.fill" size={16} color={colors.success} />
          <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
        </View>
      ))}
      {selected && (
        <View style={[styles.selectedIndicator, { backgroundColor: colors.primary }]}>
          <Text style={styles.selectedText}>Selected</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function PaywallScreen() {
  const colors = useColors();
  const [selectedPlan, setSelectedPlan] = useState<"pro" | "law_firm">("pro");
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    // In production, this would open the App Store subscription flow via react-native-purchases (RevenueCat)
    // For now, we simulate a successful purchase
    await new Promise((r) => setTimeout(r, 1500));
    await setSubscription({ tier: selectedPlan });
    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Subscription Activated!",
      `Welcome to Citation Shield ${selectedPlan === "pro" ? "Pro" : "Law Firm"}. You now have unlimited scans.`,
      [{ text: "Start Scanning", onPress: () => router.replace("/scan/upload") }]
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="xmark" size={18} color={colors.muted} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Upgrade</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>⭐</Text>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Unlock Unlimited Scans</Text>
          <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
            You've used all your free scans. Upgrade to keep verifying citations without limits.
          </Text>
        </View>

        {/* Plans */}
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={selectedPlan === plan.id}
            onSelect={() => setSelectedPlan(plan.id)}
          />
        ))}

        {/* Subscribe Button */}
        <Pressable
          onPress={handleSubscribe}
          disabled={loading}
          style={({ pressed }) => [
            styles.subscribeButton,
            { backgroundColor: colors.primary, opacity: loading || pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.subscribeButtonText}>
            {loading ? "Processing…" : `Subscribe to ${selectedPlan === "pro" ? "Pro" : "Law Firm"}`}
          </Text>
        </Pressable>

        <Text style={[styles.legalText, { color: colors.muted }]}>
          Subscriptions auto-renew. Cancel anytime in App Store settings. By subscribing you agree to our Terms of Service.
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignItems: "center" })}
        >
          <Text style={[styles.notNowText, { color: colors.muted }]}>Not now</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  hero: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  heroEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  planCard: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
    overflow: "hidden",
  },
  popularBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  popularText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  planName: {
    fontSize: 18,
    fontWeight: "700",
  },
  planDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  planPriceContainer: {
    alignItems: "flex-end",
  },
  planPrice: {
    fontSize: 26,
    fontWeight: "700",
  },
  planPeriod: {
    fontSize: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureText: {
    fontSize: 14,
  },
  selectedIndicator: {
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  selectedText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  subscribeButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  subscribeButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  legalText: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
  notNowText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
