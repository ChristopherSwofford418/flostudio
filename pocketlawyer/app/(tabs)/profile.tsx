import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  getUsage,
  getSubscription,
  FREE_QUESTIONS_PER_DAY,
  FREE_DOCUMENTS_PER_DAY,
  clearAllData,
} from "@/lib/legal-store";

const GOLD = "#C9A84C";
const GOLD_DIM = "rgba(201,168,76,0.10)";
const GOLD_BORDER = "rgba(201,168,76,0.22)";
const MIDNIGHT = "#0A0E1A";
const SURFACE = "#111827";
const SURFACE2 = "#1A2235";
const MUTED = "#8A9BB5";
const BORDER = "#1E2D45";
const PARCHMENT = "#F0EAD6";
const SUCCESS = "#2ECC8F";

interface UsageState {
  questionsUsed: number;
  documentsUsed: number;
  isPro: boolean;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [usage, setUsage] = useState<UsageState>({
    questionsUsed: 0,
    documentsUsed: 0,
    isPro: false,
  });
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    setLoaded(true);
    (async () => {
      const [u, sub] = await Promise.all([getUsage(), getSubscription()]);
      setUsage({ questionsUsed: u.questionsUsed, documentsUsed: u.documentsUsed, isPro: sub.isPro });
    })();
  }

  const handleUpgrade = useCallback(() => {
    router.push("/paywall" as any);
  }, [router]);

  const handleClearData = useCallback(() => {
    Alert.alert(
      "Clear All Data",
      "This will delete all your conversation history and usage data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            setUsage({ questionsUsed: 0, documentsUsed: 0, isPro: false });
            Alert.alert("Cleared", "All data has been cleared.");
          },
        },
      ]
    );
  }, []);

  const questionsLeft = Math.max(0, FREE_QUESTIONS_PER_DAY - usage.questionsUsed);
  const docsLeft = Math.max(0, FREE_DOCUMENTS_PER_DAY - usage.documentsUsed);
  const questionPct = usage.isPro ? 1 : (usage.questionsUsed / FREE_QUESTIONS_PER_DAY);
  const docPct = usage.isPro ? 1 : (usage.documentsUsed / FREE_DOCUMENTS_PER_DAY);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Text style={styles.headerSubtitle}>Account & Settings</Text>
      </View>
      <View style={styles.goldRule} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Identity card */}
        <View style={styles.identityCard}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarEmoji}>⚖️</Text>
            </View>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.identityName}>PocketLawyer</Text>
            <Text style={styles.identityRole}>AI Legal Assistant</Text>
          </View>
          {usage.isPro ? (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          ) : (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>FREE</Text>
            </View>
          )}
        </View>

        {/* Usage stats */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionLabel}>TODAY'S USAGE</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>💬</Text>
            <Text style={styles.statValue}>{usage.isPro ? "∞" : `${questionsLeft}`}</Text>
            <Text style={styles.statLabel}>{usage.isPro ? "Unlimited" : `of ${FREE_QUESTIONS_PER_DAY} left`}</Text>
            <Text style={styles.statName}>Questions</Text>
            {!usage.isPro && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${questionPct * 100}%` as any, backgroundColor: questionPct >= 1 ? "#E05252" : GOLD }]} />
              </View>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statEmoji}>📄</Text>
            <Text style={styles.statValue}>{usage.isPro ? "∞" : `${docsLeft}`}</Text>
            <Text style={styles.statLabel}>{usage.isPro ? "Unlimited" : `of ${FREE_DOCUMENTS_PER_DAY} left`}</Text>
            <Text style={styles.statName}>Documents</Text>
            {!usage.isPro && (
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${docPct * 100}%` as any, backgroundColor: docPct >= 1 ? "#E05252" : GOLD }]} />
              </View>
            )}
          </View>
        </View>

        {/* Pro upgrade card */}
        {!usage.isPro && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionLabel}>MEMBERSHIP</Text>
            </View>

            <Pressable
              onPress={handleUpgrade}
              style={({ pressed }) => [styles.proCard, pressed && { opacity: 0.85 }]}
            >
              {/* Decorative corner */}
              <View style={styles.proCardCorner} />

              <View style={styles.proCardTop}>
                <View style={styles.proCardIcon}>
                  <Text style={{ fontSize: 22 }}>👑</Text>
                </View>
                <View style={styles.proCardText}>
                  <Text style={styles.proCardTitle}>PocketLawyer Pro</Text>
                  <Text style={styles.proCardSubtitle}>Unlimited access to all features</Text>
                </View>
              </View>

              <View style={styles.proFeatures}>
                {[
                  "Unlimited AI legal questions",
                  "Unlimited document analysis",
                  "Priority AI responses",
                  "Full conversation history",
                ].map((f) => (
                  <View key={f} style={styles.proFeatureRow}>
                    <Text style={styles.proFeatureCheck}>✦</Text>
                    <Text style={styles.proFeatureText}>{f}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.proPricing}>
                <View style={styles.proPriceOption}>
                  <Text style={styles.proPriceAmount}>$9.99</Text>
                  <Text style={styles.proPricePeriod}>/month</Text>
                </View>
                <View style={styles.proPriceDivider} />
                <View style={styles.proPriceOption}>
                  <Text style={styles.proPriceAmount}>$79.99</Text>
                  <Text style={styles.proPricePeriod}>/year</Text>
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>SAVE 33%</Text>
                  </View>
                </View>
              </View>

              <View style={styles.upgradeBtn}>
                <Text style={styles.upgradeBtnText}>Upgrade to Pro →</Text>
              </View>
            </Pressable>
          </>
        )}

        {/* Settings */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionLabel}>SETTINGS</Text>
        </View>

        <View style={styles.settingsCard}>
          {[
            { icon: "info.circle.fill", label: "About PocketLawyer", onPress: () => Alert.alert("PocketLawyer", "Version 1.0.0\n\nAI-powered legal information assistant.\n\npocketlawyer.io") },
            { icon: "doc.text.fill", label: "Privacy Policy", onPress: () => Linking.openURL("https://pocketlawyer.io/privacy") },
            { icon: "checkmark.circle.fill", label: "Terms of Service", onPress: () => Linking.openURL("https://pocketlawyer.io/terms") },
            { icon: "star.fill", label: "Rate PocketLawyer", onPress: () => Linking.openURL("https://apps.apple.com/app/id6745678901") },
            { icon: "paperplane.fill", label: "Contact Support", onPress: () => Linking.openURL("mailto:support@pocketlawyer.io") },
          ].map((item, i, arr) => (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              style={({ pressed }) => [
                styles.settingsRow,
                i < arr.length - 1 && styles.settingsRowBorder,
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={styles.settingsIcon}>
                <IconSymbol name={item.icon as any} size={16} color={GOLD} />
              </View>
              <Text style={styles.settingsLabel}>{item.label}</Text>
              <IconSymbol name="chevron.right" size={14} color="#3D4F6B" />
            </Pressable>
          ))}
        </View>

        {/* Danger zone */}
        <Pressable
          onPress={handleClearData}
          style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.clearBtnText}>Clear All Data</Text>
        </Pressable>

        {/* Legal disclaimer */}
        <View style={styles.legalNote}>
          <Text style={styles.legalNoteText}>
            PocketLawyer provides general legal information only — not legal advice. Always consult a licensed attorney for your specific situation.
          </Text>
          <Text style={styles.legalNoteVersion}>pocketlawyer.io · v1.0.0</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MIDNIGHT },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: PARCHMENT, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, color: MUTED, marginTop: 2, letterSpacing: 0.3 },
  goldRule: { height: 1, backgroundColor: GOLD_BORDER },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Identity card
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 24,
  },
  avatarRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GOLD_DIM,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GOLD_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: { fontSize: 24 },
  identityText: { flex: 1 },
  identityName: { fontSize: 17, fontWeight: "800", color: PARCHMENT },
  identityRole: { fontSize: 12, color: MUTED, marginTop: 2 },
  proBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  proBadgeText: { fontSize: 10, fontWeight: "800", color: GOLD, letterSpacing: 1 },
  freeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: SURFACE2,
    borderWidth: 1,
    borderColor: BORDER,
  },
  freeBadgeText: { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 1 },

  // Section headers
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: GOLD, letterSpacing: 1.8 },

  // Stats grid
  statsGrid: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: 28, fontWeight: "800", color: GOLD, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: MUTED },
  statName: { fontSize: 13, fontWeight: "600", color: PARCHMENT, marginTop: 2 },
  progressBar: {
    width: "100%",
    height: 3,
    backgroundColor: BORDER,
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: { height: 3, borderRadius: 2 },

  // Pro card
  proCard: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    padding: 20,
    marginBottom: 24,
    overflow: "hidden",
    position: "relative",
  },
  proCardCorner: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: GOLD_DIM,
  },
  proCardTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  proCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  proCardText: { flex: 1 },
  proCardTitle: { fontSize: 18, fontWeight: "800", color: GOLD, letterSpacing: -0.3 },
  proCardSubtitle: { fontSize: 12, color: MUTED, marginTop: 2 },
  proFeatures: { gap: 8, marginBottom: 18 },
  proFeatureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  proFeatureCheck: { fontSize: 11, color: GOLD, fontWeight: "700" },
  proFeatureText: { fontSize: 14, color: PARCHMENT },
  proPricing: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1220",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 14,
    gap: 0,
  },
  proPriceOption: { flex: 1, alignItems: "center", flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "center" },
  proPriceAmount: { fontSize: 20, fontWeight: "800", color: PARCHMENT },
  proPricePeriod: { fontSize: 13, color: MUTED, marginTop: 2 },
  proPriceDivider: { width: 1, height: 32, backgroundColor: BORDER, marginHorizontal: 8 },
  saveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: SUCCESS + "20",
    borderWidth: 1,
    borderColor: SUCCESS + "40",
    marginLeft: 4,
  },
  saveBadgeText: { fontSize: 9, fontWeight: "800", color: SUCCESS, letterSpacing: 0.5 },
  upgradeBtn: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  upgradeBtnText: { fontSize: 15, fontWeight: "800", color: MIDNIGHT, letterSpacing: 0.3 },

  // Settings
  settingsCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  settingsIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsLabel: { flex: 1, fontSize: 15, color: PARCHMENT, fontWeight: "500" },

  // Clear data
  clearBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0525230",
    backgroundColor: "#E0525210",
    alignItems: "center",
    marginBottom: 24,
  },
  clearBtnText: { fontSize: 14, fontWeight: "600", color: "#E05252" },

  // Legal note
  legalNote: { alignItems: "center", gap: 6 },
  legalNoteText: { fontSize: 11, color: "#3D4F6B", textAlign: "center", lineHeight: 17 },
  legalNoteVersion: { fontSize: 11, color: "#3D4F6B" },
});
