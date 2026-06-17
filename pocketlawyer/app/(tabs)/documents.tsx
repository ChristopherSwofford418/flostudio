import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import {
  getUsage,
  getSubscription,
  incrementDocumentUsage,
  FREE_DOCUMENTS_PER_DAY,
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
const ERROR_COLOR = "#E05252";
const WARNING = "#F0B429";

interface AnalysisResult {
  documentType: string;
  summary: string;
  keyClauses: { title: string; text: string; importance: "high" | "medium" | "low" }[];
  redFlags: { issue: string; explanation: string; severity: "critical" | "warning" | "info" }[];
  recommendedActions: string[];
}

const SAMPLE_TEXTS = [
  "Paste a lease agreement…",
  "Paste an employment contract…",
  "Paste an NDA or terms of service…",
];

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [docsLeft, setDocsLeft] = useState(FREE_DOCUMENTS_PER_DAY);
  const [isPro, setIsPro] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const analyzeMutation = trpc.legal.analyzeDocument.useMutation();

  // Lazy-load usage on first render
  if (!loaded) {
    setLoaded(true);
    (async () => {
      const [usage, sub] = await Promise.all([getUsage(), getSubscription()]);
      setIsPro(sub.isPro);
      if (!sub.isPro) setDocsLeft(Math.max(0, FREE_DOCUMENTS_PER_DAY - usage.documentsUsed));
    })();
  }

  const handleAnalyze = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 50) {
      Alert.alert("Too Short", "Please paste at least 50 characters of document text.");
      return;
    }
    if (!isPro && docsLeft <= 0) {
      router.push("/paywall" as any);
      return;
    }

    try {
      const data = await analyzeMutation.mutateAsync({ text: trimmed, documentName: "Pasted Document" });
        setResult(data as unknown as AnalysisResult);
      if (!isPro) {
        await incrementDocumentUsage();
        setDocsLeft((prev) => Math.max(0, prev - 1));
      }
    } catch {
      Alert.alert("Analysis Failed", "Unable to analyze the document. Please try again.");
    }
  }, [text, isPro, docsLeft, analyzeMutation]);

  const handleClear = () => {
    setText("");
    setResult(null);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Document Analysis</Text>
          <Text style={styles.headerSubtitle}>AI-powered contract review</Text>
        </View>
        <View style={styles.headerRight}>
          {!isPro && (
            <View style={styles.usagePill}>
              <Text style={[styles.usageText, docsLeft === 0 && { color: ERROR_COLOR }]}>
                {docsLeft} left
              </Text>
            </View>
          )}
          {isPro && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.goldRule} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Input card */}
        <View style={styles.inputCard}>
          <View style={styles.inputCardHeader}>
            <View style={styles.inputCardIcon}>
              <Text style={{ fontSize: 16 }}>📄</Text>
            </View>
            <Text style={styles.inputCardTitle}>Paste Document Text</Text>
          </View>

          <TextInput
            style={styles.textArea}
            placeholder={SAMPLE_TEXTS[0]}
            placeholderTextColor="#3D4F6B"
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            maxLength={10000}
          />

          <View style={styles.inputCardFooter}>
            <Text style={styles.charCount}>{text.length.toLocaleString()} / 10,000 chars</Text>
            {text.length > 0 && (
              <Pressable onPress={handleClear} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
                <Text style={styles.clearBtn}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Analyze button */}
        <Pressable
          onPress={handleAnalyze}
          disabled={!text.trim() || analyzeMutation.isPending}
          style={({ pressed }) => [
            styles.analyzeBtn,
            (!text.trim() || analyzeMutation.isPending) && { opacity: 0.4 },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          {analyzeMutation.isPending ? (
            <ActivityIndicator size="small" color={MIDNIGHT} />
          ) : (
            <>
              <Text style={styles.analyzeBtnIcon}>⚖</Text>
              <Text style={styles.analyzeBtnText}>Analyze Document</Text>
            </>
          )}
        </Pressable>

        {analyzeMutation.isPending && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={styles.loadingTitle}>Reviewing your document…</Text>
            <Text style={styles.loadingSubtitle}>Identifying key clauses, red flags, and recommendations</Text>
          </View>
        )}

        {/* Results */}
        {result && !analyzeMutation.isPending && (
          <View style={styles.results}>
            {/* Summary */}
            <View style={styles.resultSection}>
              <View style={styles.resultSectionHeader}>
                <View style={[styles.resultIcon, { backgroundColor: GOLD_DIM, borderColor: GOLD_BORDER }]}>
                  <Text style={{ fontSize: 14 }}>📋</Text>
                </View>
                <Text style={styles.resultSectionTitle}>Summary</Text>
              </View>
              <View style={styles.resultCard}>
                <Text style={styles.resultText}>{result.summary}</Text>
              </View>
            </View>

            {/* Key Points */}
            {result.keyClauses?.length > 0 && (
              <View style={styles.resultSection}>
                <View style={styles.resultSectionHeader}>
                  <View style={[styles.resultIcon, { backgroundColor: SUCCESS + "15", borderColor: SUCCESS + "30" }]}>
                    <Text style={{ fontSize: 14 }}>✓</Text>
                  </View>
                  <Text style={styles.resultSectionTitle}>Key Clauses</Text>
                </View>
                {result.keyClauses.map((clause, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={[styles.bullet, { backgroundColor: clause.importance === "high" ? GOLD : SUCCESS }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bulletText, { fontWeight: "700", color: PARCHMENT, marginBottom: 2 }]}>{clause.title}</Text>
                      <Text style={styles.bulletText}>{clause.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Red Flags */}
            {result.redFlags?.length > 0 && (
              <View style={styles.resultSection}>
                <View style={styles.resultSectionHeader}>
                  <View style={[styles.resultIcon, { backgroundColor: ERROR_COLOR + "15", borderColor: ERROR_COLOR + "30" }]}>
                    <Text style={{ fontSize: 14 }}>⚠</Text>
                  </View>
                  <Text style={[styles.resultSectionTitle, { color: ERROR_COLOR }]}>Red Flags</Text>
                </View>
                {result.redFlags.map((flag, i) => (
                  <View key={i} style={[styles.bulletRow, styles.redFlagRow]}>
                    <View style={[styles.bullet, { backgroundColor: flag.severity === "critical" ? ERROR_COLOR : WARNING }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bulletText, { fontWeight: "700", color: PARCHMENT, marginBottom: 2 }]}>{flag.issue}</Text>
                      <Text style={[styles.bulletText, { color: "#F0EAD6" }]}>{flag.explanation}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Recommendations */}
            {result.recommendedActions?.length > 0 && (
              <View style={styles.resultSection}>
                <View style={styles.resultSectionHeader}>
                  <View style={[styles.resultIcon, { backgroundColor: GOLD_DIM, borderColor: GOLD_BORDER }]}>
                    <Text style={{ fontSize: 14 }}>💡</Text>
                  </View>
                  <Text style={[styles.resultSectionTitle, { color: GOLD }]}>Recommendations</Text>
                </View>
                {result.recommendedActions.map((rec, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={[styles.bullet, { backgroundColor: GOLD }]} />
                    <Text style={styles.bulletText}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Disclaimer */}
            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>
                ⚠ This analysis is for informational purposes only and does not constitute legal advice. Consult a licensed attorney before making legal decisions.
              </Text>
            </View>
          </View>
        )}

        {/* Empty state */}
        {!result && !analyzeMutation.isPending && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyEmoji}>📜</Text>
            </View>
            <Text style={styles.emptyTitle}>Analyze Any Document</Text>
            <Text style={styles.emptySubtitle}>
              Paste a contract, lease, NDA, or any legal document above and get an instant AI-powered breakdown.
            </Text>
            <View style={styles.featureList}>
              {["Key clauses identified", "Red flags highlighted", "Plain-English summary", "Actionable recommendations"].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Text style={styles.featureCheck}>✦</Text>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MIDNIGHT },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: PARCHMENT, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, color: MUTED, marginTop: 2, letterSpacing: 0.3 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  usagePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  usageText: { fontSize: 11, fontWeight: "600", color: MUTED },
  proBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  proBadgeText: { fontSize: 10, fontWeight: "800", color: GOLD, letterSpacing: 1 },
  goldRule: { height: 1, backgroundColor: GOLD_BORDER },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Input card
  inputCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },
  inputCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  inputCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  inputCardTitle: { fontSize: 15, fontWeight: "700", color: PARCHMENT },
  textArea: {
    minHeight: 140,
    color: PARCHMENT,
    fontSize: 14,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: "#0D1220",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  charCount: { fontSize: 11, color: "#3D4F6B" },
  clearBtn: { fontSize: 12, color: GOLD, fontWeight: "600" },

  // Analyze button
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: GOLD,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 20,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  analyzeBtnIcon: { fontSize: 18 },
  analyzeBtnText: { fontSize: 16, fontWeight: "800", color: MIDNIGHT, letterSpacing: 0.2 },

  // Loading
  loadingCard: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 14,
  },
  loadingTitle: { fontSize: 17, fontWeight: "700", color: PARCHMENT },
  loadingSubtitle: { fontSize: 13, color: MUTED, textAlign: "center", lineHeight: 20 },

  // Results
  results: { gap: 20 },
  resultSection: {},
  resultSectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  resultSectionTitle: { fontSize: 16, fontWeight: "700", color: PARCHMENT },
  resultCard: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  resultText: { fontSize: 14, color: PARCHMENT, lineHeight: 22 },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 8,
  },
  redFlagRow: { borderColor: ERROR_COLOR + "30", backgroundColor: ERROR_COLOR + "08" },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 14, color: MUTED, lineHeight: 21 },
  disclaimer: {
    backgroundColor: SURFACE2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginTop: 4,
  },
  disclaimerText: { fontSize: 11, color: "#3D4F6B", lineHeight: 17, textAlign: "center" },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: 16, paddingBottom: 8 },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: PARCHMENT, marginBottom: 10, textAlign: "center" },
  emptySubtitle: { fontSize: 14, color: MUTED, lineHeight: 22, textAlign: "center", marginBottom: 24 },
  featureList: { width: "100%", gap: 10 },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  featureCheck: { fontSize: 12, color: GOLD, fontWeight: "700" },
  featureText: { fontSize: 14, color: PARCHMENT },
});
