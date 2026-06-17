import { useState, useEffect } from "react";
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
import { trpc } from "@/lib/trpc";
import {
  getHealthProfile,
  getHealthScore,
  saveHealthProfile,
  saveHealthScore,
  type LegalHealthProfile,
  type LegalHealthScore,
  type LifeSituation,
} from "@/lib/legal-store";

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

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const SITUATIONS: Array<{ id: LifeSituation; label: string; emoji: string; desc: string }> = [
  { id: "tenant", label: "Renter / Tenant", emoji: "🏠", desc: "You rent your home or apartment" },
  { id: "homeowner", label: "Homeowner", emoji: "🏡", desc: "You own your home" },
  { id: "employee", label: "Employee", emoji: "💼", desc: "You work for a company" },
  { id: "business_owner", label: "Business Owner", emoji: "🏢", desc: "You own or run a business" },
  { id: "freelancer", label: "Freelancer / Contractor", emoji: "💻", desc: "You work independently" },
  { id: "parent", label: "Parent / Guardian", emoji: "👨‍👩‍👧", desc: "You have children or dependents" },
  { id: "student", label: "Student", emoji: "🎓", desc: "You are enrolled in school" },
  { id: "retiree", label: "Retiree", emoji: "🌅", desc: "You are retired" },
];

function SeverityColor(severity: string): string {
  if (severity === "critical") return CRITICAL;
  if (severity === "high") return WARNING;
  if (severity === "medium") return GOLD;
  return SUCCESS;
}

function GradeColor(grade: string): string {
  if (grade === "A") return SUCCESS;
  if (grade === "B") return GOLD;
  if (grade === "C") return WARNING;
  return CRITICAL;
}

export default function HealthScoreScreen() {
  const [step, setStep] = useState<"setup" | "loading" | "results">("setup");
  const [selectedSituations, setSelectedSituations] = useState<LifeSituation[]>([]);
  const [selectedState, setSelectedState] = useState("CA");
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [score, setScore] = useState<LegalHealthScore | null>(null);

  const generateMutation = trpc.legal.generateHealthScore.useMutation();

  useEffect(() => {
    async function load() {
      const [profile, existingScore] = await Promise.all([
        getHealthProfile(),
        getHealthScore(),
      ]);
      if (profile) {
        setSelectedSituations(profile.situations);
        setSelectedState(profile.state);
      }
      if (existingScore) {
        setScore(existingScore);
        setStep("results");
      }
    }
    load();
  }, []);

  function toggleSituation(id: LifeSituation) {
    setSelectedSituations((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function handleGenerate() {
    if (selectedSituations.length === 0) {
      Alert.alert("Select Your Situations", "Please select at least one life situation to continue.");
      return;
    }
    setStep("loading");
    const profile: LegalHealthProfile = {
      situations: selectedSituations,
      state: selectedState,
      lastUpdated: new Date().toISOString(),
    };
    await saveHealthProfile(profile);

    try {
      const result = await generateMutation.mutateAsync({
        situations: selectedSituations,
        state: selectedState,
      });
      const fullScore: LegalHealthScore = { ...result, generatedAt: result.generatedAt };
      await saveHealthScore(fullScore);
      setScore(fullScore);
      setStep("results");
    } catch (err) {
      Alert.alert("Error", "Failed to generate your score. Please try again.");
      setStep("setup");
    }
  }

  // ── Setup Step ──
  if (step === "setup") {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.navBar}>
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={() => router.back()}>
            <IconSymbol name="arrow.left" size={24} color={PARCHMENT} />
          </Pressable>
          <Text style={styles.navTitle}>Legal Health Score</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.setupHeading}>Tell us about your life</Text>
          <Text style={styles.setupSubheading}>
            Select all that apply. We'll identify your specific legal risks.
          </Text>

          {SITUATIONS.map((s) => {
            const selected = selectedSituations.includes(s.id);
            return (
              <Pressable
                key={s.id}
                style={({ pressed }) => [
                  styles.situationCard,
                  selected && styles.situationCardSelected,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => toggleSituation(s.id)}
              >
                <Text style={styles.situationEmoji}>{s.emoji}</Text>
                <View style={styles.situationText}>
                  <Text style={[styles.situationLabel, selected && { color: GOLD }]}>{s.label}</Text>
                  <Text style={styles.situationDesc}>{s.desc}</Text>
                </View>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && <IconSymbol name="checkmark.circle.fill" size={20} color={GOLD} />}
                </View>
              </Pressable>
            );
          })}

          {/* State Selector */}
          <Text style={styles.stateLabel}>Your State</Text>
          <Pressable
            style={[styles.stateSelector, showStatePicker && { borderColor: GOLD }]}
            onPress={() => setShowStatePicker(!showStatePicker)}
          >
            <Text style={styles.stateSelectorText}>{selectedState}</Text>
            <IconSymbol name={showStatePicker ? "chevron.up" : "chevron.down"} size={18} color={MUTED} />
          </Pressable>

          {showStatePicker && (
            <View style={styles.stateGrid}>
              {US_STATES.map((st) => (
                <Pressable
                  key={st}
                  style={[styles.stateChip, selectedState === st && styles.stateChipSelected]}
                  onPress={() => {
                    setSelectedState(st);
                    setShowStatePicker(false);
                  }}
                >
                  <Text style={[styles.stateChipText, selectedState === st && { color: MIDNIGHT }]}>
                    {st}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}
            onPress={handleGenerate}
          >
            <IconSymbol name="sparkles" size={18} color={MIDNIGHT} />
            <Text style={styles.generateBtnText}>Generate My Legal Health Score</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            Your information stays on your device. This is general legal information, not legal advice.
          </Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── Loading Step ──
  if (step === "loading") {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.loadingContainer}>
          <View style={styles.loadingOrb}>
            <IconSymbol name="shield.fill" size={40} color={GOLD} />
          </View>
          <Text style={styles.loadingTitle}>Analyzing Your Legal Profile</Text>
          <Text style={styles.loadingSubtitle}>
            Our AI is reviewing your situations and identifying risks specific to {selectedState}...
          </Text>
          <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 24 }} />
        </View>
      </ScreenContainer>
    );
  }

  // ── Results Step ──
  if (!score) return null;
  const gradeColor = GradeColor(score.grade);

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={styles.navBar}>
        <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={24} color={PARCHMENT} />
        </Pressable>
        <Text style={styles.navTitle}>Legal Health Score</Text>
        <Pressable onPress={() => setStep("setup")}>
          <Text style={{ fontSize: 12, color: GOLD }}>Retake</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Score Hero */}
        <View style={styles.scoreHero}>
          <View style={[styles.scoreCircle, { borderColor: gradeColor }]}>
            <Text style={[styles.scoreHeroNumber, { color: gradeColor }]}>{score.score}</Text>
            <Text style={styles.scoreHeroLabel}>/ 100</Text>
          </View>
          <View style={[styles.gradeTag, { backgroundColor: gradeColor }]}>
            <Text style={styles.gradeTagText}>Grade {score.grade}</Text>
          </View>
          <Text style={styles.scoreSummaryText}>{score.summary}</Text>
        </View>

        {/* Risks */}
        <Text style={styles.sectionTitle}>⚠️ Legal Risks Identified</Text>
        {score.risks.map((risk, i) => (
          <View key={i} style={styles.riskCard}>
            <View style={[styles.riskSeverityBar, { backgroundColor: SeverityColor(risk.severity) }]} />
            <View style={styles.riskContent}>
              <View style={styles.riskHeader}>
                <Text style={styles.riskCategory}>{risk.category}</Text>
                <View style={[styles.severityBadge, { backgroundColor: SeverityColor(risk.severity) + "22" }]}>
                  <Text style={[styles.severityBadgeText, { color: SeverityColor(risk.severity) }]}>
                    {risk.severity.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.riskTitle}>{risk.title}</Text>
              <Text style={styles.riskDesc}>{risk.description}</Text>
              <Pressable
                style={({ pressed }) => [styles.riskActionBtn, pressed && { opacity: 0.75 }]}
                onPress={() => router.push("/(tabs)/ask" as any)}
              >
                <Text style={styles.riskActionText}>{risk.actionLabel} →</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* Strengths */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>✅ Your Legal Strengths</Text>
        <View style={styles.strengthsCard}>
          {score.strengths.map((s, i) => (
            <View key={i} style={styles.strengthRow}>
              <IconSymbol name="checkmark.circle.fill" size={16} color={SUCCESS} />
              <Text style={styles.strengthText}>{s}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <Pressable
          style={({ pressed }) => [styles.wizardCta, pressed && { opacity: 0.85 }]}
          onPress={() => router.push("/situation-wizard" as any)}
        >
          <IconSymbol name="wand.and.stars" size={20} color={MIDNIGHT} />
          <Text style={styles.wizardCtaText}>Address a Risk with the Situation Wizard</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
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
  navTitle: { fontSize: 16, fontWeight: "700", color: PARCHMENT },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  // Setup
  setupHeading: { fontSize: 24, fontWeight: "800", color: PARCHMENT, marginBottom: 8 },
  setupSubheading: { fontSize: 14, color: MUTED, lineHeight: 22, marginBottom: 20 },

  situationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  situationCardSelected: { borderColor: GOLD + "88" },
  situationEmoji: { fontSize: 24 },
  situationText: { flex: 1 },
  situationLabel: { fontSize: 14, fontWeight: "600", color: PARCHMENT, marginBottom: 2 },
  situationDesc: { fontSize: 12, color: MUTED },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: NAVY_BORDER,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: { borderColor: "transparent" },

  stateLabel: { fontSize: 13, fontWeight: "600", color: PARCHMENT, marginTop: 16, marginBottom: 8 },
  stateSelector: {
    backgroundColor: NAVY_CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stateSelectorText: { fontSize: 15, fontWeight: "600", color: PARCHMENT },
  stateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 12,
  },
  stateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#1A2540",
  },
  stateChipSelected: { backgroundColor: GOLD },
  stateChipText: { fontSize: 12, fontWeight: "600", color: PARCHMENT },

  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 20,
  },
  generateBtnText: { fontSize: 16, fontWeight: "700", color: MIDNIGHT },
  disclaimer: { fontSize: 11, color: MUTED, textAlign: "center", marginTop: 12, lineHeight: 18 },

  // Loading
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

  // Results
  scoreHero: { alignItems: "center", marginBottom: 28, paddingVertical: 8 },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: MIDNIGHT,
    marginBottom: 12,
  },
  scoreHeroNumber: { fontSize: 40, fontWeight: "900" },
  scoreHeroLabel: { fontSize: 12, color: MUTED },
  gradeTag: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 14,
  },
  gradeTagText: { fontSize: 13, fontWeight: "800", color: MIDNIGHT },
  scoreSummaryText: { fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 22, paddingHorizontal: 16 },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: PARCHMENT,
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  riskCard: {
    flexDirection: "row",
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    marginBottom: 10,
    overflow: "hidden",
  },
  riskSeverityBar: { width: 4 },
  riskContent: { flex: 1, padding: 14 },
  riskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  riskCategory: { fontSize: 11, color: MUTED, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  severityBadgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  riskTitle: { fontSize: 14, fontWeight: "700", color: PARCHMENT, marginBottom: 4 },
  riskDesc: { fontSize: 12, color: MUTED, lineHeight: 18, marginBottom: 8 },
  riskActionBtn: { alignSelf: "flex-start" },
  riskActionText: { fontSize: 12, color: GOLD, fontWeight: "600" },

  strengthsCard: {
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUCCESS + "44",
    padding: 16,
    gap: 10,
    marginBottom: 20,
  },
  strengthRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  strengthText: { fontSize: 13, color: PARCHMENT, lineHeight: 20, flex: 1 },

  wizardCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 8,
  },
  wizardCtaText: { fontSize: 15, fontWeight: "700", color: MIDNIGHT },
});
