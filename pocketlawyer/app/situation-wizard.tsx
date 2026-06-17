import { useState } from "react";
import {
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import {
  saveSituationPlan,
  getSituationPlans,
  deleteSituationPlan,
  type SituationPlan,
  type SituationType,
} from "@/lib/legal-store";
import { useEffect } from "react";

// ─── Color constants ──────────────────────────────────────────────────────────
const MIDNIGHT = "#0A0E1A";
const NAVY_CARD = "#111827";
const NAVY_BORDER = "#1E2D45";
const GOLD = "#C9A84C";
const PARCHMENT = "#F5EDD6";
const MUTED = "#7A8FA6";
const CRITICAL = "#E05252";
const WARNING = "#E8A84C";
const SUCCESS = "#4CAF7D";
const PURPLE = "#7B61FF";

const SITUATIONS: Array<{
  id: SituationType;
  label: string;
  emoji: string;
  category: string;
  desc: string;
}> = [
  { id: "eviction", label: "Facing Eviction", emoji: "🏠", category: "Housing", desc: "Landlord is trying to remove me" },
  { id: "landlord_dispute", label: "Landlord Dispute", emoji: "🔑", category: "Housing", desc: "Issues with my landlord" },
  { id: "wrongful_termination", label: "Wrongful Termination", emoji: "💼", category: "Employment", desc: "I was fired unfairly" },
  { id: "wage_theft", label: "Unpaid Wages", emoji: "💰", category: "Employment", desc: "Employer owes me money" },
  { id: "discrimination", label: "Discrimination", emoji: "⚖️", category: "Employment", desc: "Treated unfairly at work" },
  { id: "contract_dispute", label: "Contract Dispute", emoji: "📄", category: "Contracts", desc: "Someone broke an agreement" },
  { id: "consumer_fraud", label: "Consumer Fraud", emoji: "🛡️", category: "Consumer", desc: "I was scammed or deceived" },
  { id: "debt_collection", label: "Debt Collection", emoji: "📬", category: "Consumer", desc: "Collectors are harassing me" },
  { id: "divorce", label: "Divorce", emoji: "💔", category: "Family", desc: "Ending a marriage" },
  { id: "custody", label: "Child Custody", emoji: "👶", category: "Family", desc: "Custody or visitation issues" },
  { id: "personal_injury", label: "Personal Injury", emoji: "🏥", category: "Injury", desc: "I was hurt due to negligence" },
  { id: "criminal_charge", label: "Criminal Charge", emoji: "🚔", category: "Criminal", desc: "I've been charged with a crime" },
  { id: "immigration", label: "Immigration Issue", emoji: "✈️", category: "Immigration", desc: "Visa, green card, or status" },
  { id: "small_claims", label: "Small Claims Court", emoji: "🏛️", category: "Courts", desc: "Filing or responding to a claim" },
  { id: "other", label: "Other Legal Issue", emoji: "❓", category: "Other", desc: "Something not listed above" },
];

const URGENCY_COLORS: Record<string, string> = {
  immediate: CRITICAL,
  this_week: WARNING,
  this_month: GOLD,
  no_rush: SUCCESS,
};

const URGENCY_LABELS: Record<string, string> = {
  immediate: "⚡ Act Immediately",
  this_week: "📅 This Week",
  this_month: "🗓️ This Month",
  no_rush: "✅ No Rush",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: CRITICAL,
  high: WARNING,
  medium: GOLD,
  low: SUCCESS,
};

export default function SituationWizardScreen() {
  const [view, setView] = useState<"list" | "select" | "describe" | "loading" | "plan">("list");
  const [selectedSituation, setSelectedSituation] = useState<(typeof SITUATIONS)[0] | null>(null);
  const [description, setDescription] = useState("");
  const [state, setState] = useState("CA");
  const [currentPlan, setCurrentPlan] = useState<SituationPlan | null>(null);
  const [savedPlans, setSavedPlans] = useState<SituationPlan[]>([]);

  const generateMutation = trpc.legal.generateSituationPlan.useMutation();

  useEffect(() => {
    getSituationPlans().then(setSavedPlans);
  }, []);

  async function handleGenerate() {
    if (!selectedSituation) return;
    setView("loading");
    try {
      const result = await generateMutation.mutateAsync({
        situationType: selectedSituation.id,
        situationLabel: selectedSituation.label,
        userDescription: description || `I am dealing with: ${selectedSituation.label}`,
        state,
      });
      const plan: SituationPlan = {
        id: Date.now().toString(),
        situationType: selectedSituation.id,
        situationLabel: selectedSituation.label,
        userDescription: description,
        createdAt: new Date().toISOString(),
        ...result,
      };
      await saveSituationPlan(plan);
      const updated = await getSituationPlans();
      setSavedPlans(updated);
      setCurrentPlan(plan);
      setView("plan");
    } catch {
      Alert.alert("Error", "Failed to generate your action plan. Please try again.");
      setView("describe");
    }
  }

  async function handleDeletePlan(id: string) {
    await deleteSituationPlan(id);
    setSavedPlans(await getSituationPlans());
  }

  // ── List View ──
  if (view === "list") {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.navBar}>
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={() => router.back()}>
            <IconSymbol name="arrow.left" size={24} color={PARCHMENT} />
          </Pressable>
          <Text style={styles.navTitle}>Situation Wizard</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>What's your legal situation?</Text>
          <Text style={styles.subheading}>
            Tell us what you're facing and we'll build a step-by-step action plan.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.newPlanBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setView("select")}
          >
            <IconSymbol name="wand.and.stars" size={20} color={MIDNIGHT} />
            <Text style={styles.newPlanBtnText}>Create New Action Plan</Text>
          </Pressable>

          {savedPlans.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Your Active Plans</Text>
              {savedPlans.map((plan) => (
                <View key={plan.id} style={styles.savedPlanCard}>
                  <Pressable
                    style={styles.savedPlanMain}
                    onPress={() => {
                      setCurrentPlan(plan);
                      setView("plan");
                    }}
                  >
                    <View style={[styles.urgencyIndicator, { backgroundColor: URGENCY_COLORS[plan.urgencyLevel] }]} />
                    <View style={styles.savedPlanInfo}>
                      <Text style={styles.savedPlanTitle}>{plan.situationLabel}</Text>
                      <Text style={styles.savedPlanMeta}>
                        {plan.steps.length} steps • {URGENCY_LABELS[plan.urgencyLevel]}
                      </Text>
                      <Text style={styles.savedPlanDate}>
                        {new Date(plan.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={18} color={MUTED} />
                  </Pressable>
                  <Pressable
                    style={styles.deletePlanBtn}
                    onPress={() =>
                      Alert.alert("Delete Plan", "Remove this action plan?", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => handleDeletePlan(plan.id) },
                      ])
                    }
                  >
                    <IconSymbol name="trash.fill" size={16} color={CRITICAL} />
                  </Pressable>
                </View>
              ))}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── Select Situation ──
  if (view === "select") {
    const categories = [...new Set(SITUATIONS.map((s) => s.category))];
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.navBar}>
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={() => setView("list")}>
            <IconSymbol name="arrow.left" size={24} color={PARCHMENT} />
          </Pressable>
          <Text style={styles.navTitle}>Select Your Situation</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {categories.map((cat) => (
            <View key={cat}>
              <Text style={styles.categoryLabel}>{cat}</Text>
              {SITUATIONS.filter((s) => s.category === cat).map((s) => (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [styles.situationRow, pressed && { opacity: 0.8 }]}
                  onPress={() => {
                    setSelectedSituation(s);
                    setView("describe");
                  }}
                >
                  <Text style={styles.situationEmoji}>{s.emoji}</Text>
                  <View style={styles.situationInfo}>
                    <Text style={styles.situationLabel}>{s.label}</Text>
                    <Text style={styles.situationDesc}>{s.desc}</Text>
                  </View>
                  <IconSymbol name="chevron.right" size={18} color={MUTED} />
                </Pressable>
              ))}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── Describe Situation ──
  if (view === "describe") {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.navBar}>
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={() => setView("select")}>
            <IconSymbol name="arrow.left" size={24} color={PARCHMENT} />
          </Pressable>
          <Text style={styles.navTitle}>{selectedSituation?.label}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeEmoji}>{selectedSituation?.emoji}</Text>
            <Text style={styles.selectedBadgeLabel}>{selectedSituation?.label}</Text>
          </View>

          <Text style={styles.describeLabel}>Describe your situation (optional)</Text>
          <Text style={styles.describeHint}>
            The more detail you provide, the more specific your action plan will be.
          </Text>
          <TextInput
            style={styles.describeInput}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. My landlord gave me a 3-day notice to pay rent or quit. I've been a tenant for 3 years and always paid on time..."
            placeholderTextColor={MUTED}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <Text style={styles.stateLabel}>Your State</Text>
          <View style={styles.stateRow}>
            {["CA", "NY", "TX", "FL", "IL", "WA", "GA", "AZ", "CO", "MA"].map((st) => (
              <Pressable
                key={st}
                style={[styles.stateChip, state === st && styles.stateChipSelected]}
                onPress={() => setState(st)}
              >
                <Text style={[styles.stateChipText, state === st && { color: MIDNIGHT }]}>{st}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}
            onPress={handleGenerate}
          >
            <IconSymbol name="wand.and.stars" size={18} color={MIDNIGHT} />
            <Text style={styles.generateBtnText}>Build My Action Plan</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            This is general legal information, not legal advice. Results are AI-generated.
          </Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── Loading ──
  if (view === "loading") {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.loadingContainer}>
          <View style={styles.loadingOrb}>
            <Text style={{ fontSize: 36 }}>{selectedSituation?.emoji}</Text>
          </View>
          <Text style={styles.loadingTitle}>Building Your Action Plan</Text>
          <Text style={styles.loadingSubtitle}>
            Analyzing {selectedSituation?.label} laws in {state} and creating your personalized step-by-step guide...
          </Text>
          <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 24 }} />
        </View>
      </ScreenContainer>
    );
  }

  // ── Plan View ──
  if (view === "plan" && currentPlan) {
    const urgencyColor = URGENCY_COLORS[currentPlan.urgencyLevel];
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.navBar}>
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={() => setView("list")}>
            <IconSymbol name="arrow.left" size={24} color={PARCHMENT} />
          </Pressable>
          <Text style={styles.navTitle} numberOfLines={1}>{currentPlan.situationLabel}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Urgency Banner */}
          <View style={[styles.urgencyBanner, { backgroundColor: urgencyColor + "22", borderColor: urgencyColor + "66" }]}>
            <Text style={[styles.urgencyBannerText, { color: urgencyColor }]}>
              {URGENCY_LABELS[currentPlan.urgencyLevel]}
            </Text>
          </View>

          {/* Overview */}
          <View style={styles.overviewCard}>
            <Text style={styles.overviewText}>{currentPlan.overview}</Text>
          </View>

          {/* Steps */}
          <Text style={styles.sectionTitle}>Your Action Steps</Text>
          {currentPlan.steps.map((step, i) => (
            <View key={i} style={styles.stepCard}>
              <View style={[styles.stepNumber, { backgroundColor: PRIORITY_COLORS[step.priority] }]}>
                <Text style={styles.stepNumberText}>{step.stepNumber}</Text>
              </View>
              <View style={styles.stepContent}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[step.priority] + "22" }]}>
                    <Text style={[styles.priorityBadgeText, { color: PRIORITY_COLORS[step.priority] }]}>
                      {step.priority.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.stepDesc}>{step.description}</Text>
                <View style={styles.stepActionBox}>
                  <Text style={styles.stepActionLabel}>ACTION:</Text>
                  <Text style={styles.stepAction}>{step.action}</Text>
                </View>
                <Text style={styles.stepTimeframe}>⏱ {step.timeframe}</Text>
                {(step.resources ?? []).length > 0 && (
                  <View style={styles.resourcesList}>
                    {(step.resources ?? []).map((r, ri) => (
                      <View key={ri} style={styles.resourceItem}>
                        <Text style={styles.resourceBullet}>•</Text>
                        <Text style={styles.resourceText}>{r}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ))}

          {/* Key Rights */}
          {currentPlan.keyRights.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>⚖️ Your Key Rights</Text>
              <View style={styles.rightsCard}>
                {currentPlan.keyRights.map((r, i) => (
                  <View key={i} style={styles.rightRow}>
                    <IconSymbol name="checkmark.seal.fill" size={14} color={GOLD} />
                    <Text style={styles.rightText}>{r}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Warning Flags */}
          {currentPlan.warningFlags.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>🚨 Critical Warnings</Text>
              <View style={[styles.rightsCard, { borderColor: CRITICAL + "44" }]}>
                {currentPlan.warningFlags.map((w, i) => (
                  <View key={i} style={styles.rightRow}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={14} color={CRITICAL} />
                    <Text style={[styles.rightText, { color: "#FFB3B3" }]}>{w}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Cost + Attorney */}
          <View style={styles.costCard}>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Estimated Cost</Text>
              <Text style={styles.costValue}>{currentPlan.estimatedCost}</Text>
            </View>
            {currentPlan.shouldHireAttorney && (
              <View style={[styles.attorneyRow]}>
                <IconSymbol name="person.2.fill" size={16} color={GOLD} />
                <Text style={styles.attorneyText}>
                  Recommended: {currentPlan.attorneyType}
                </Text>
              </View>
            )}
          </View>

          {/* Ask AI CTA */}
          <Pressable
            style={({ pressed }) => [styles.askAiBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.push("/(tabs)/ask" as any)}
          >
            <IconSymbol name="bubble.left.and.bubble.right.fill" size={18} color={MIDNIGHT} />
            <Text style={styles.askAiBtnText}>Ask AI Follow-Up Questions</Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: NAVY_BORDER,
  },
  navTitle: { fontSize: 16, fontWeight: "700", color: PARCHMENT, flex: 1, textAlign: "center" },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  heading: { fontSize: 24, fontWeight: "800", color: PARCHMENT, marginBottom: 8 },
  subheading: { fontSize: 14, color: MUTED, lineHeight: 22, marginBottom: 20 },

  newPlanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 24,
  },
  newPlanBtnText: { fontSize: 16, fontWeight: "700", color: MIDNIGHT },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: PARCHMENT,
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: "uppercase",
  },

  savedPlanCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  savedPlanMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  urgencyIndicator: { width: 4, height: 40, borderRadius: 2 },
  savedPlanInfo: { flex: 1 },
  savedPlanTitle: { fontSize: 14, fontWeight: "600", color: PARCHMENT, marginBottom: 2 },
  savedPlanMeta: { fontSize: 11, color: MUTED, marginBottom: 2 },
  savedPlanDate: { fontSize: 10, color: MUTED + "88" },
  deletePlanBtn: { padding: 14 },

  categoryLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GOLD,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  situationRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 14,
    marginBottom: 6,
    gap: 12,
  },
  situationEmoji: { fontSize: 22 },
  situationInfo: { flex: 1 },
  situationLabel: { fontSize: 14, fontWeight: "600", color: PARCHMENT, marginBottom: 2 },
  situationDesc: { fontSize: 12, color: MUTED },

  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: GOLD + "22",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD + "44",
    padding: 14,
    marginBottom: 20,
  },
  selectedBadgeEmoji: { fontSize: 24 },
  selectedBadgeLabel: { fontSize: 16, fontWeight: "700", color: GOLD },

  describeLabel: { fontSize: 14, fontWeight: "600", color: PARCHMENT, marginBottom: 6 },
  describeHint: { fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 18 },
  describeInput: {
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 14,
    color: PARCHMENT,
    fontSize: 14,
    lineHeight: 22,
    minHeight: 120,
    marginBottom: 20,
  },

  stateLabel: { fontSize: 13, fontWeight: "600", color: PARCHMENT, marginBottom: 8 },
  stateRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 },
  stateChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: NAVY_CARD,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
  },
  stateChipSelected: { backgroundColor: GOLD, borderColor: GOLD },
  stateChipText: { fontSize: 12, fontWeight: "600", color: PARCHMENT },

  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 12,
  },
  generateBtnText: { fontSize: 16, fontWeight: "700", color: MIDNIGHT },
  disclaimer: { fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 18 },

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  loadingOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: GOLD + "22",
    borderWidth: 2,
    borderColor: GOLD + "44",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  loadingTitle: { fontSize: 22, fontWeight: "800", color: PARCHMENT, textAlign: "center", marginBottom: 12 },
  loadingSubtitle: { fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 22 },

  // Plan
  urgencyBanner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  urgencyBannerText: { fontSize: 15, fontWeight: "700" },

  overviewCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 16,
    marginBottom: 20,
  },
  overviewText: { fontSize: 14, color: PARCHMENT, lineHeight: 22 },

  stepCard: {
    flexDirection: "row",
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    marginBottom: 10,
    overflow: "hidden",
    gap: 0,
  },
  stepNumber: {
    width: 36,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
  },
  stepNumberText: { fontSize: 14, fontWeight: "800", color: MIDNIGHT },
  stepContent: { flex: 1, padding: 14 },
  stepHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  stepTitle: { fontSize: 14, fontWeight: "700", color: PARCHMENT, flex: 1, marginRight: 8 },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  priorityBadgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  stepDesc: { fontSize: 12, color: MUTED, lineHeight: 18, marginBottom: 8 },
  stepActionBox: {
    backgroundColor: "#1A2540",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  stepActionLabel: { fontSize: 9, fontWeight: "700", color: GOLD, letterSpacing: 1, marginBottom: 4 },
  stepAction: { fontSize: 12, color: PARCHMENT, lineHeight: 18 },
  stepTimeframe: { fontSize: 11, color: MUTED, marginBottom: 6 },
  resourcesList: { gap: 4 },
  resourceItem: { flexDirection: "row", gap: 6 },
  resourceBullet: { fontSize: 11, color: GOLD },
  resourceText: { fontSize: 11, color: MUTED, flex: 1, lineHeight: 16 },

  rightsCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD + "44",
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  rightRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rightText: { fontSize: 13, color: PARCHMENT, lineHeight: 20, flex: 1 },

  costCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  costRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  costLabel: { fontSize: 13, color: MUTED },
  costValue: { fontSize: 13, fontWeight: "600", color: PARCHMENT, flex: 1, textAlign: "right" },
  attorneyRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  attorneyText: { fontSize: 13, color: GOLD, flex: 1, lineHeight: 20 },

  askAiBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
  },
  askAiBtnText: { fontSize: 15, fontWeight: "700", color: MIDNIGHT },
});
