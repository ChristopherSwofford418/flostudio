/**
 * Paywall Screen — PocketLawyer Pro
 * Luxury dark navy/gold design with real StoreKit purchase buttons
 */

import { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useSubscription } from "@/hooks/use-subscription";

const GOLD = "#C9A84C";
const GOLD_DIM = "rgba(201,168,76,0.12)";
const GOLD_BORDER = "rgba(201,168,76,0.28)";
const MIDNIGHT = "#0A0E1A";
const SURFACE = "#111827";
const SURFACE2 = "#1A2235";
const MUTED = "#8A9BB5";
const BORDER = "#1E2D45";
const PARCHMENT = "#F0EAD6";
const SUCCESS = "#2ECC8F";

const PRO_FEATURES = [
  { icon: "infinity", label: "Unlimited AI legal questions" },
  { icon: "doc.text.magnifyingglass", label: "Unlimited document analysis" },
  { icon: "bolt.fill", label: "Priority AI responses" },
  { icon: "shield.lefthalf.filled", label: "Legal Health Score monitoring" },
  { icon: "star.fill", label: "Full Situation Wizard access" },
  { icon: "books.vertical.fill", label: "Complete Know Your Rights library" },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    isPro,
    products,
    loading,
    purchasing,
    error,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
  } = useSubscription();

  // If already pro, go back
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleMonthly = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("iOS Only", "In-app purchases are only available on iPhone.");
      return;
    }
    await purchaseMonthly();
    if (isPro) router.back();
  }, [purchaseMonthly, isPro, router]);

  const handleAnnual = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("iOS Only", "In-app purchases are only available on iPhone.");
      return;
    }
    await purchaseAnnual();
    if (isPro) router.back();
  }, [purchaseAnnual, isPro, router]);

  const handleRestore = useCallback(async () => {
    await restorePurchases();
    if (isPro) {
      Alert.alert("Restored", "Your Pro subscription has been restored.", [
        { text: "Continue", onPress: () => router.back() },
      ]);
    } else {
      Alert.alert("No Purchase Found", "No active subscription was found for this Apple ID.");
    }
  }, [restorePurchases, isPro, router]);

  // Find product prices from StoreKit (fallback to defaults)
  const monthlyProduct = products.find((p) => p.productId.includes("monthly"));
  const annualProduct = products.find((p) => p.productId.includes("annual"));
  const monthlyPrice = monthlyProduct?.price ?? "$9.99";
  const annualPrice = annualProduct?.price ?? "$79.99";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Close button */}
      <Pressable
        style={styles.closeBtn}
        onPress={handleClose}
        hitSlop={12}
      >
        <IconSymbol name="xmark.circle.fill" size={28} color={MUTED} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>POCKETLAWYER PRO</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>Your Personal{"\n"}Legal Powerhouse</Text>
          <Text style={styles.heroSub}>
            Expert AI legal guidance, unlimited access, and proactive protection — all in your pocket.
          </Text>
        </View>

        {/* Gold rule */}
        <View style={styles.goldRule} />

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionLabel}>EVERYTHING IN PRO</Text>
          <View style={styles.featuresList}>
            {PRO_FEATURES.map((f) => (
              <View key={f.icon} style={styles.featureRow}>
                <View style={styles.featureIconWrap}>
                  <IconSymbol name={f.icon as any} size={16} color={GOLD} />
                </View>
                <Text style={styles.featureText}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Pricing cards */}
        <View style={styles.pricingSection}>
          <Text style={styles.sectionLabel}>CHOOSE YOUR PLAN</Text>

          {/* Annual — Best Value */}
          <Pressable
            style={({ pressed }) => [
              styles.planCard,
              styles.planCardAnnual,
              pressed && { opacity: 0.88 },
            ]}
            onPress={handleAnnual}
            disabled={purchasing || loading}
          >
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>BEST VALUE — SAVE 33%</Text>
            </View>
            <View style={styles.planCardInner}>
              <View style={styles.planLeft}>
                <Text style={styles.planName}>Annual</Text>
                <Text style={styles.planBilling}>Billed once per year</Text>
              </View>
              <View style={styles.planRight}>
                <Text style={styles.planPrice}>{annualPrice}</Text>
                <Text style={styles.planPriceSub}>/ year</Text>
              </View>
            </View>
            {purchasing ? (
              <ActivityIndicator color={MIDNIGHT} size="small" style={{ marginTop: 8 }} />
            ) : (
              <View style={styles.planCta}>
                <Text style={styles.planCtaText}>Start Annual Plan</Text>
              </View>
            )}
          </Pressable>

          {/* Monthly */}
          <Pressable
            style={({ pressed }) => [
              styles.planCard,
              styles.planCardMonthly,
              pressed && { opacity: 0.88 },
            ]}
            onPress={handleMonthly}
            disabled={purchasing || loading}
          >
            <View style={styles.planCardInner}>
              <View style={styles.planLeft}>
                <Text style={[styles.planName, { color: PARCHMENT }]}>Monthly</Text>
                <Text style={styles.planBilling}>Billed every month</Text>
              </View>
              <View style={styles.planRight}>
                <Text style={[styles.planPrice, { color: PARCHMENT }]}>{monthlyPrice}</Text>
                <Text style={styles.planPriceSub}>/ month</Text>
              </View>
            </View>
            {purchasing ? (
              <ActivityIndicator color={GOLD} size="small" style={{ marginTop: 8 }} />
            ) : (
              <View style={[styles.planCta, styles.planCtaOutline]}>
                <Text style={[styles.planCtaText, { color: GOLD }]}>Start Monthly Plan</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#F87171" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Legal footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel in iOS Settings → Apple ID → Subscriptions.
          </Text>
          <Pressable onPress={handleRestore} hitSlop={8}>
            <Text style={styles.restoreText}>Restore Purchases</Text>
          </Pressable>
          <View style={styles.footerLinks}>
            <Pressable onPress={() => {}}>
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.footerDot}>·</Text>
            <Pressable onPress={() => {}}>
              <Text style={styles.footerLink}>Terms of Use</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: MIDNIGHT,
  },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 10,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  hero: {
    paddingTop: 48,
    alignItems: "center",
    marginBottom: 24,
  },
  badgeRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  badge: {
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  badgeText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  heroTitle: {
    color: PARCHMENT,
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 40,
    marginBottom: 12,
  },
  heroSub: {
    color: MUTED,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  goldRule: {
    height: 1,
    backgroundColor: GOLD_BORDER,
    marginBottom: 28,
  },
  featuresSection: {
    marginBottom: 28,
  },
  sectionLabel: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 14,
  },
  featuresList: {
    gap: 12,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    color: PARCHMENT,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  pricingSection: {
    gap: 14,
    marginBottom: 20,
  },
  planCard: {
    borderRadius: 16,
    overflow: "hidden",
    padding: 20,
  },
  planCardAnnual: {
    backgroundColor: GOLD,
  },
  planCardMonthly: {
    backgroundColor: SURFACE2,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  bestValueBadge: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  bestValueText: {
    color: MIDNIGHT,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  planCardInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  planLeft: { flex: 1 },
  planRight: { alignItems: "flex-end" },
  planName: {
    color: MIDNIGHT,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  planBilling: {
    color: "rgba(10,14,26,0.65)",
    fontSize: 12,
  },
  planPrice: {
    color: MIDNIGHT,
    fontSize: 28,
    fontWeight: "800",
  },
  planPriceSub: {
    color: "rgba(10,14,26,0.65)",
    fontSize: 12,
    marginTop: 2,
  },
  planCta: {
    backgroundColor: MIDNIGHT,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  planCtaOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  planCtaText: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#F87171",
    fontSize: 13,
    flex: 1,
  },
  footer: {
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  footerText: {
    color: MUTED,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
  restoreText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  footerLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerLink: {
    color: MUTED,
    fontSize: 11,
    textDecorationLine: "underline",
  },
  footerDot: {
    color: MUTED,
    fontSize: 11,
  },
});
