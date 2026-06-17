import { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  getHealthScore,
  getHealthProfile,
  getSituationPlans,
  getDocuments,
  type LegalHealthScore,
  type SituationPlan,
} from "@/lib/legal-store";

// ─── Color constants ──────────────────────────────────────────────────────────
const MIDNIGHT = "#0A0E1A";
const NAVY = "#0D1628";
const NAVY_CARD = "#111827";
const NAVY_BORDER = "#1E2D45";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8C96A";
const PARCHMENT = "#F5EDD6";
const MUTED = "#7A8FA6";
const CRITICAL = "#E05252";
const WARNING = "#E8A84C";
const SUCCESS = "#4CAF7D";

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const gradeColor =
    grade === "A" ? SUCCESS :
    grade === "B" ? GOLD :
    grade === "C" ? WARNING :
    CRITICAL;

  return (
    <View style={styles.scoreRingContainer}>
      <View style={[styles.scoreRingOuter, { borderColor: gradeColor }]}>
        <View style={styles.scoreRingInner}>
          <Text style={[styles.scoreNumber, { color: gradeColor }]}>{score}</Text>
          <Text style={styles.scoreLabel}>/ 100</Text>
        </View>
      </View>
      <View style={[styles.gradeBadge, { backgroundColor: gradeColor }]}>
        <Text style={styles.gradeText}>{grade}</Text>
      </View>
    </View>
  );
}

// ─── Quick Action Card ────────────────────────────────────────────────────────
function QuickActionCard({
  icon,
  label,
  sublabel,
  onPress,
  accent,
}: {
  icon: string;
  label: string;
  sublabel: string;
  onPress: () => void;
  accent: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.75 }]}
      onPress={onPress}
    >
      <View style={[styles.quickIconBg, { backgroundColor: accent + "22" }]}>
        <IconSymbol name={icon as any} size={22} color={accent} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickSublabel}>{sublabel}</Text>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const [healthScore, setHealthScore] = useState<LegalHealthScore | null>(null);
  const [recentPlans, setRecentPlans] = useState<SituationPlan[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [score, plans, docs] = await Promise.all([
        getHealthScore(),
        getSituationPlans(),
        getDocuments(),
      ]);
      setHealthScore(score);
      setRecentPlans(plans.slice(0, 2));
      setDocCount(docs.length);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasScore = healthScore !== null;

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>POCKETLAWYER</Text>
            <Text style={styles.headerTitle}>Your Legal Command Center</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.headerAvatar, pressed && { opacity: 0.7 }]}
            onPress={() => router.push("/(tabs)/profile" as any)}
          >
            <IconSymbol name="person.crop.circle.fill" size={32} color={GOLD} />
          </Pressable>
        </View>

        {/* ── Legal Health Score Card ── */}
        <View style={styles.healthCard}>
          <View style={styles.healthCardHeader}>
            <View style={styles.healthCardTitleRow}>
              <IconSymbol name="shield.fill" size={18} color={GOLD} />
              <Text style={styles.healthCardTitle}>Legal Health Score</Text>
            </View>
            {hasScore && (
              <Text style={styles.healthCardDate}>
                {new Date(healthScore!.generatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={GOLD} style={{ marginVertical: 24 }} />
          ) : hasScore ? (
            <>
              <View style={styles.scoreRow}>
                <ScoreRing score={healthScore!.score} grade={healthScore!.grade} />
                <View style={styles.scoreSummaryCol}>
                  <Text style={styles.scoreSummary}>{healthScore!.summary}</Text>
                  {healthScore!.risks.slice(0, 2).map((risk, i) => (
                    <View key={i} style={styles.riskChip}>
                      <View
                        style={[
                          styles.riskDot,
                          {
                            backgroundColor:
                              risk.severity === "critical"
                                ? CRITICAL
                                : risk.severity === "high"
                                ? WARNING
                                : GOLD,
                          },
                        ]}
                      />
                      <Text style={styles.riskChipText} numberOfLines={1}>
                        {risk.title}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.scoreUpdateBtn, pressed && { opacity: 0.75 }]}
                onPress={() => router.push("/health-score" as any)}
              >
                <Text style={styles.scoreUpdateBtnText}>View Full Report →</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.noScoreContainer}>
              <Text style={styles.noScoreText}>
                Get your personalized Legal Health Score — understand your risks before they become problems.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.generateScoreBtn, pressed && { opacity: 0.8 }]}
                onPress={() => router.push("/health-score" as any)}
              >
                <IconSymbol name="sparkles" size={16} color={MIDNIGHT} />
                <Text style={styles.generateScoreBtnText}>Generate My Score</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          <QuickActionCard
            icon="bubble.left.and.bubble.right.fill"
            label="Ask AI"
            sublabel="Legal Q&A"
            accent={GOLD}
            onPress={() => router.push("/(tabs)/ask" as any)}
          />
          <QuickActionCard
            icon="wand.and.stars"
            label="Situation Wizard"
            sublabel="Get a plan"
            accent="#7B61FF"
            onPress={() => router.push("/situation-wizard" as any)}
          />
          <QuickActionCard
            icon="doc.text.fill"
            label="Analyze Doc"
            sublabel="Contract review"
            accent="#4CAF7D"
            onPress={() => router.push("/(tabs)/documents" as any)}
          />
          <QuickActionCard
            icon="hand.raised.fill"
            label="Know Your Rights"
            sublabel="Daily cards"
            accent="#E05252"
            onPress={() => router.push("/rights-cards" as any)}
          />
        </View>

        {/* ── Active Situation Plans ── */}
        {recentPlans.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Active Plans</Text>
              <Pressable onPress={() => router.push("/situation-wizard" as any)}>
                <Text style={styles.sectionLink}>View all</Text>
              </Pressable>
            </View>
            {recentPlans.map((plan) => (
              <Pressable
                key={plan.id}
                style={({ pressed }) => [styles.planCard, pressed && { opacity: 0.8 }]}
                onPress={() => router.push("/situation-wizard" as any)}
              >
                <View style={styles.planCardLeft}>
                  <View
                    style={[
                      styles.urgencyDot,
                      {
                        backgroundColor:
                          plan.urgencyLevel === "immediate"
                            ? CRITICAL
                            : plan.urgencyLevel === "this_week"
                            ? WARNING
                            : SUCCESS,
                      },
                    ]}
                  />
                  <View>
                    <Text style={styles.planCardTitle}>{plan.situationLabel}</Text>
                    <Text style={styles.planCardMeta}>
                      {plan.steps.length} steps •{" "}
                      {plan.urgencyLevel === "immediate"
                        ? "Act Now"
                        : plan.urgencyLevel === "this_week"
                        ? "This Week"
                        : plan.urgencyLevel === "this_month"
                        ? "This Month"
                        : "No Rush"}
                    </Text>
                  </View>
                </View>
                <IconSymbol name="chevron.right" size={18} color={MUTED} />
              </Pressable>
            ))}
          </>
        )}

        {/* ── Know Your Rights Daily Card ── */}
        <Pressable
          style={({ pressed }) => [styles.rightsTeaser, pressed && { opacity: 0.8 }]}
          onPress={() => router.push("/rights-cards" as any)}
        >
          <View style={styles.rightsTeaserLeft}>
            <View style={styles.rightsTeaserIcon}>
              <IconSymbol name="hand.raised.fill" size={22} color={CRITICAL} />
            </View>
            <View>
              <Text style={styles.rightsTeaserLabel}>KNOW YOUR RIGHTS</Text>
              <Text style={styles.rightsTeaserTitle}>Daily Legal Card</Text>
              <Text style={styles.rightsTeaserSub}>Swipe through bite-sized legal knowledge</Text>
            </View>
          </View>
          <IconSymbol name="chevron.right" size={18} color={MUTED} />
        </Pressable>

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{docCount}</Text>
            <Text style={styles.statLabel}>Documents{"\n"}Analyzed</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{recentPlans.length}</Text>
            <Text style={styles.statLabel}>Action{"\n"}Plans</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <IconSymbol name="shield.fill" size={20} color={GOLD} />
            <Text style={styles.statLabel}>AI-Powered{"\n"}Protection</Text>
          </View>
        </View>

        {/* ── Bottom CTA ── */}
        <View style={styles.ctaBanner}>
          <View style={styles.ctaLeft}>
            <IconSymbol name="crown.fill" size={20} color={GOLD} />
            <View style={styles.ctaTextCol}>
              <Text style={styles.ctaTitle}>Upgrade to Pro</Text>
              <Text style={styles.ctaSubtitle}>Unlimited AI • Priority support</Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.8 }]}
            onPress={() => router.push("/(tabs)/profile" as any)}
          >
            <Text style={styles.ctaBtnText}>$9.99/mo</Text>
          </Pressable>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    color: GOLD,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: PARCHMENT,
    letterSpacing: 0.3,
  },
  headerAvatar: { padding: 4 },

  // Health Score Card
  healthCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 18,
    marginBottom: 24,
  },
  healthCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  healthCardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  healthCardTitle: { fontSize: 13, fontWeight: "700", color: PARCHMENT, letterSpacing: 0.5 },
  healthCardDate: { fontSize: 11, color: MUTED },

  // Score Ring
  scoreRingContainer: { alignItems: "center", position: "relative" },
  scoreRingOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: MIDNIGHT,
  },
  scoreRingInner: { alignItems: "center" },
  scoreNumber: { fontSize: 28, fontWeight: "800" },
  scoreLabel: { fontSize: 10, color: MUTED, marginTop: -2 },
  gradeBadge: {
    position: "absolute",
    bottom: -6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gradeText: { fontSize: 11, fontWeight: "800", color: MIDNIGHT },

  scoreRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  scoreSummaryCol: { flex: 1, gap: 8 },
  scoreSummary: { fontSize: 12, color: MUTED, lineHeight: 18 },
  riskChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1A2540",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  riskDot: { width: 6, height: 6, borderRadius: 3 },
  riskChipText: { fontSize: 11, color: PARCHMENT, flex: 1 },

  scoreUpdateBtn: { marginTop: 14, alignSelf: "flex-end" },
  scoreUpdateBtnText: { fontSize: 12, color: GOLD, fontWeight: "600" },

  noScoreContainer: { alignItems: "center", paddingVertical: 8, gap: 12 },
  noScoreText: { fontSize: 13, color: MUTED, textAlign: "center", lineHeight: 20 },
  generateScoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GOLD,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  generateScoreBtnText: { fontSize: 14, fontWeight: "700", color: MIDNIGHT },

  // Section
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: PARCHMENT,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionLink: { fontSize: 12, color: GOLD },

  // Quick Actions
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 28,
  },
  quickCard: {
    width: "47.5%",
    backgroundColor: NAVY_CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 14,
    gap: 8,
  },
  quickIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  quickLabel: { fontSize: 14, fontWeight: "700", color: PARCHMENT },
  quickSublabel: { fontSize: 11, color: MUTED },

  // Plans
  planCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  planCardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  urgencyDot: { width: 8, height: 8, borderRadius: 4 },
  planCardTitle: { fontSize: 13, fontWeight: "600", color: PARCHMENT, marginBottom: 2 },
  planCardMeta: { fontSize: 11, color: MUTED },

  // Stats
  statsRow: {
    flexDirection: "row",
    backgroundColor: NAVY_CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 16,
    marginBottom: 20,
    marginTop: 4,
    alignItems: "center",
  },
  statCard: { flex: 1, alignItems: "center", gap: 4 },
  statNumber: { fontSize: 24, fontWeight: "800", color: GOLD },
  statLabel: { fontSize: 10, color: MUTED, textAlign: "center", lineHeight: 14 },
  statDivider: { width: 1, height: 36, backgroundColor: NAVY_BORDER },

  // CTA Banner
  ctaBanner: {
    backgroundColor: "#1A1A2E",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GOLD + "44",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ctaLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  ctaTextCol: { gap: 2 },
  ctaTitle: { fontSize: 14, fontWeight: "700", color: PARCHMENT },
  ctaSubtitle: { fontSize: 11, color: MUTED },
  ctaBtn: {
    backgroundColor: GOLD,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  ctaBtnText: { fontSize: 12, fontWeight: "700", color: MIDNIGHT },

  // Rights Teaser
  rightsTeaser: {
    backgroundColor: NAVY_CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  rightsTeaserLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  rightsTeaserIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: CRITICAL + "22",
    justifyContent: "center",
    alignItems: "center",
  },
  rightsTeaserLabel: { fontSize: 9, fontWeight: "700", color: CRITICAL, letterSpacing: 1.5, marginBottom: 2 },
  rightsTeaserTitle: { fontSize: 14, fontWeight: "700", color: PARCHMENT },
  rightsTeaserSub: { fontSize: 11, color: MUTED, marginTop: 2 },
});
