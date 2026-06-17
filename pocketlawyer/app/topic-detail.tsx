import { useCallback } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";

const GOLD = "#C9A84C";
const GOLD_DIM = "rgba(201,168,76,0.10)";
const GOLD_BORDER = "rgba(201,168,76,0.22)";
const MIDNIGHT = "#0A0E1A";
const SURFACE = "#111827";
const SURFACE2 = "#1A2235";
const MUTED = "#8A9BB5";
const BORDER = "#1E2D45";
const PARCHMENT = "#F0EAD6";

const TOPIC_OVERVIEWS: Record<string, string> = {
  employment:
    "Employment law governs the relationship between employers and employees. Key areas include wrongful termination, workplace discrimination, wage and hour laws, and employee benefits. In most U.S. states, employment is 'at-will,' meaning either party can end the relationship at any time — but there are important exceptions for discrimination, retaliation, and contract violations.",
  housing:
    "Landlord-tenant law covers the rights and responsibilities of both parties in a rental relationship. Tenants have the right to a habitable living space, proper notice before entry, and protection against illegal eviction. Landlords must follow strict procedures for eviction and are limited in what they can deduct from security deposits.",
  family:
    "Family law addresses legal matters involving family relationships — divorce, child custody, child support, adoption, and domestic violence. Courts prioritize the 'best interests of the child' in custody decisions. Property division in divorce varies by state, with some following community property rules and others using equitable distribution.",
  contracts:
    "A contract is a legally binding agreement between two or more parties. To be enforceable, a contract generally needs an offer, acceptance, and consideration (something of value exchanged). Verbal contracts can be enforceable, but written contracts are much easier to prove. Breach of contract occurs when one party fails to fulfill their obligations.",
  business:
    "Business law covers the formation and operation of businesses. An LLC (Limited Liability Company) protects personal assets from business debts. Corporations offer similar protection but with more complex governance. Trademarks protect brand names and logos, while NDAs (Non-Disclosure Agreements) protect confidential information shared between parties.",
  debt:
    "Debt collection is regulated by the Fair Debt Collection Practices Act (FDCPA), which prohibits harassment, false statements, and unfair practices. Debts have a statute of limitations — after which collectors cannot sue to collect. Bankruptcy (Chapter 7 or Chapter 13) can provide relief from overwhelming debt, though it has long-term credit implications.",
  criminal:
    "Criminal law defines offenses against society and the penalties for them. Misdemeanors are less serious crimes (fines, up to 1 year in jail), while felonies are more serious (over 1 year in prison). The Miranda rights protect individuals during police interrogation. You have the right to remain silent and the right to an attorney — always exercise these rights.",
  immigration:
    "U.S. immigration law is complex and constantly changing. A visa allows temporary entry, while a green card grants permanent residency. Citizenship can be obtained through naturalization after meeting residency requirements. Undocumented immigrants still have constitutional rights, including due process protections in removal proceedings.",
  estate:
    "Estate planning ensures your assets are distributed according to your wishes after death. A will directs how your property is distributed. A trust can avoid probate and provide more control over asset distribution. A power of attorney designates someone to make financial or medical decisions on your behalf if you become incapacitated.",
};

export default function TopicDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id: string;
    title: string;
    description: string;
    color: string;
    quickQuestions: string;
  }>();

  const { id, title, description, color, quickQuestions: qJson } = params;
  const accentColor = color ?? GOLD;
  const quickQuestions: string[] = qJson ? JSON.parse(qJson) : [];
  const overview = TOPIC_OVERVIEWS[id] ?? "Tap a question below to learn more about this legal topic.";

  const handleAskQuestion = useCallback(
    (question: string) => {
      router.push({
        pathname: "/(tabs)" as any,
        params: { prefillQuestion: question },
      });
    },
    [router]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
        >
          <IconSymbol name="chevron.left.forwardslash.chevron.right" size={18} color={GOLD} />
          <Text style={styles.backText}>Topics</Text>
        </Pressable>
      </View>

      {/* Accent rule */}
      <View style={[styles.accentRule, { backgroundColor: accentColor + "60" }]} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { borderColor: accentColor + "30" }]}>
          <View style={[styles.heroAccentBar, { backgroundColor: accentColor }]} />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroDesc}>{description}</Text>
          </View>
        </View>

        {/* Overview */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.sectionLabel, { color: accentColor }]}>OVERVIEW</Text>
        </View>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewText}>{overview}</Text>
        </View>

        {/* Quick questions */}
        {quickQuestions.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.sectionLabel, { color: accentColor }]}>COMMON QUESTIONS</Text>
            </View>

            <View style={styles.questionsGrid}>
              {quickQuestions.map((q, i) => (
                <Pressable
                  key={i}
                  onPress={() => handleAskQuestion(q)}
                  style={({ pressed }) => [
                    styles.questionCard,
                    { borderColor: accentColor + "25" },
                    pressed && { opacity: 0.7, transform: [{ scale: 0.985 }] },
                  ]}
                >
                  <View style={[styles.questionNum, { backgroundColor: accentColor + "15", borderColor: accentColor + "30" }]}>
                    <Text style={[styles.questionNumText, { color: accentColor }]}>{i + 1}</Text>
                  </View>
                  <Text style={styles.questionText}>{q}</Text>
                  <View style={[styles.questionArrow, { backgroundColor: accentColor + "15" }]}>
                    <Text style={[styles.questionArrowText, { color: accentColor }]}>→</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* CTA */}
        <Pressable
          onPress={() => router.push("/(tabs)" as any)}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: accentColor, shadowColor: accentColor },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.ctaBtnText}>Ask Your Own Question →</Text>
        </Pressable>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ⚠ General legal information only — not legal advice. Consult a licensed attorney for your specific situation.
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MIDNIGHT },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { fontSize: 15, color: GOLD, fontWeight: "600" },
  accentRule: { height: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Hero
  hero: {
    flexDirection: "row",
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    overflow: "hidden",
  },
  heroAccentBar: { width: 4 },
  heroContent: { flex: 1, padding: 16 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: PARCHMENT, letterSpacing: -0.4, marginBottom: 6 },
  heroDesc: { fontSize: 14, color: MUTED, lineHeight: 21 },

  // Section headers
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.8 },

  // Overview
  overviewCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 24,
  },
  overviewText: { fontSize: 15, color: PARCHMENT, lineHeight: 25 },

  // Questions
  questionsGrid: { gap: 10, marginBottom: 24 },
  questionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  questionNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  questionNumText: { fontSize: 12, fontWeight: "700" },
  questionText: { flex: 1, fontSize: 14, color: PARCHMENT, lineHeight: 20 },
  questionArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  questionArrowText: { fontSize: 16, fontWeight: "700" },

  // CTA
  ctaBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  ctaBtnText: { fontSize: 16, fontWeight: "800", color: MIDNIGHT, letterSpacing: 0.2 },

  // Disclaimer
  disclaimer: {
    backgroundColor: SURFACE2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },
  disclaimerText: { fontSize: 11, color: "#3D4F6B", lineHeight: 17, textAlign: "center" },
});
