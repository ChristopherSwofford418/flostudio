/**
 * Paywall Screen — Apple App Store Review Compliant
 *
 * Compliance checklist (App Store Review Guideline 3.1.2):
 * ✅ Price and billing period clearly shown for each plan
 * ✅ Auto-renew disclosure visible without scrolling
 * ✅ Restore Purchases button present
 * ✅ Privacy Policy link accessible
 * ✅ Terms of Service link accessible
 * ✅ Cancellation instructions provided
 * ✅ No external payment links
 * ✅ IAP via native Apple StoreKit 2 (expo-iap)
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  configurePurchases,
  getOfferings,
  purchasePackage,
  restorePurchases,
  PRODUCT_IDS,
} from "@/lib/purchases";
import type { ProductOrSubscription } from "expo-iap";

type PlanId = "pro" | "law_firm";

type PlanDef = {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  billingDescription: string;
  description: string;
  features: string[];
  highlighted: boolean;
  productId: string;
};

const PLAN_DEFS: PlanDef[] = [
  {
    id: "pro",
    name: "Pro",
    price: "$29.99",
    period: "/ month",
    billingDescription: "$29.99 per month, auto-renews monthly",
    description: "For solo practitioners and small firms",
    features: [
      "Unlimited citation scans",
      "PDF, DOCX, and TXT support",
      "Full AI verification reports",
      "Export & share reports",
      "Priority processing",
    ],
    highlighted: true,
    productId: PRODUCT_IDS.pro,
  },
  {
    id: "law_firm",
    name: "Law Firm",
    price: "$99.99",
    period: "/ month",
    billingDescription: "$99.99 per month, auto-renews monthly",
    description: "For teams and large firms",
    features: [
      "Everything in Pro",
      "Up to 10 team members",
      "Bulk document scanning",
      "API access",
      "Dedicated support",
    ],
    highlighted: false,
    productId: PRODUCT_IDS.law_firm,
  },
];

function PlanCard({
  plan,
  selected,
  storeProduct,
  onSelect,
}: {
  plan: PlanDef;
  selected: boolean;
  storeProduct: ProductOrSubscription | null;
  onSelect: () => void;
}) {
  const colors = useColors();
  // Use live price from StoreKit if available, otherwise fall back to static
  const displayPrice = (storeProduct as any)?.displayPrice ?? plan.price;
  const displayBilling = storeProduct
    ? `${(storeProduct as any).displayPrice} per month, auto-renews monthly`
    : plan.billingDescription;

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
        <View style={[styles.popularBadge, { backgroundColor: colors.accent ?? colors.primary }]}>
          <Text style={styles.popularText}>MOST POPULAR</Text>
        </View>
      )}
      <View style={styles.planHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planName, { color: colors.foreground }]}>{plan.name}</Text>
          <Text style={[styles.planDesc, { color: colors.muted }]}>{plan.description}</Text>
        </View>
        <View style={styles.planPriceContainer}>
          <Text style={[styles.planPrice, { color: colors.primary }]}>{displayPrice}</Text>
          <Text style={[styles.planPeriod, { color: colors.muted }]}>{plan.period}</Text>
        </View>
      </View>
      {/* Billing description — required by Apple */}
      <Text style={[styles.billingDesc, { color: colors.muted }]}>{displayBilling}</Text>
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
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("pro");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [offerings, setOfferings] = useState<ProductOrSubscription[] | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);

  useEffect(() => {
    loadOfferings();
  }, []);

  async function loadOfferings() {
    setLoadingOfferings(true);
    try {
      await configurePurchases();
      const products = await getOfferings();
      setOfferings(products);
    } catch {
      // Silently fail — will use static prices
    } finally {
      setLoadingOfferings(false);
    }
  }

  function getProductForPlan(planId: PlanId): ProductOrSubscription | null {
    if (!offerings) return null;
    const productId = PRODUCT_IDS[planId];
    return offerings.find((p) => p.id === productId) ?? null;
  }

  async function handleSubscribe() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);

    try {
      const productId = PRODUCT_IDS[selectedPlan];
      const success = await purchasePackage(productId);

      if (!success) {
        setLoading(false);
        return; // User cancelled — don't show error
      }

      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Subscription Activated!",
        `Welcome to Citation Shield ${selectedPlan === "pro" ? "Pro" : "Law Firm"}. You now have unlimited scans.`,
        [{ text: "Start Scanning", onPress: () => router.replace("/scan/upload") }]
      );
    } catch (err: any) {
      setLoading(false);
      // Don't show error for user cancellation
      if (err?.code !== "E_USER_CANCELLED" && !err?.userCancelled) {
        Alert.alert(
          "Purchase Failed",
          err?.message || "Something went wrong. Please try again."
        );
      }
    }
  }

  async function handleRestore() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        Alert.alert(
          "Purchases Restored",
          "Your subscription has been restored.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)") }]
        );
      } else {
        Alert.alert("No Purchases Found", "No previous subscriptions were found for this Apple ID.");
      }
    } catch {
      Alert.alert("Restore Failed", "Could not restore purchases. Please try again.");
    } finally {
      setRestoring(false);
    }
  }

  const selectedProduct = getProductForPlan(selectedPlan) as any;
  const selectedDef = PLAN_DEFS.find((p) => p.id === selectedPlan)!;
  const displayPrice = (selectedProduct as any)?.displayPrice ?? selectedDef.price;

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
            Upgrade to verify citations without limits. Subscriptions auto-renew monthly. Cancel anytime in Settings → Apple ID → Subscriptions.
          </Text>
        </View>

        {/* Plans */}
        {loadingOfferings ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          PLAN_DEFS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={selectedPlan === plan.id}
              storeProduct={getProductForPlan(plan.id)}
              onSelect={() => setSelectedPlan(plan.id)}
            />
          ))
        )}

        {/* Subscribe Button */}
        <Pressable
          onPress={handleSubscribe}
          disabled={loading}
          style={({ pressed }) => [
            styles.subscribeButton,
            {
              backgroundColor: colors.primary,
              opacity: loading || pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.subscribeButtonText}>
              Subscribe — {displayPrice}/month
            </Text>
          )}
        </Pressable>

        {/* Restore Purchases — required by Apple */}
        <Pressable
          onPress={handleRestore}
          disabled={restoring}
          style={({ pressed }) => [styles.restoreButton, { opacity: pressed || restoring ? 0.6 : 1 }]}
        >
          {restoring ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={[styles.restoreText, { color: colors.primary }]}>Restore Purchases</Text>
          )}
        </Pressable>

        {/* Auto-renew disclosure — required by Apple, must be visible */}
        <Text style={[styles.legalText, { color: colors.muted }]}>
          Subscriptions automatically renew at the end of each billing period unless cancelled at least 24 hours before the renewal date. Your Apple ID account will be charged upon confirmation of purchase. Manage or cancel your subscription in Settings → Apple ID → Subscriptions.
        </Text>

        {/* Privacy & Terms links — required by Apple */}
        <View style={styles.legalLinks}>
          <Pressable
            onPress={() => Linking.openURL("https://citationshield.app/privacy")}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={[styles.legalLink, { color: colors.primary }]}>Privacy Policy</Text>
          </Pressable>
          <Text style={[styles.legalSep, { color: colors.muted }]}>·</Text>
          <Pressable
            onPress={() => Linking.openURL("https://citationshield.app/terms")}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={[styles.legalLink, { color: colors.primary }]}>Terms of Service</Text>
          </Pressable>
        </View>

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
    paddingBottom: 48,
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
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
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
  billingDesc: {
    fontSize: 11,
    lineHeight: 16,
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
  restoreButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  restoreText: {
    fontSize: 15,
    fontWeight: "500",
  },
  legalText: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  legalLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  legalLink: {
    fontSize: 13,
    fontWeight: "500",
  },
  legalSep: {
    fontSize: 13,
  },
  notNowText: {
    fontSize: 14,
    paddingVertical: 8,
  },
});
