import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getScans, type Citation, type CitationStatus } from "@/lib/scan-store";
import { IconSymbol } from "@/components/ui/icon-symbol";

function ConfidenceMeter({ value }: { value: number }) {
  const colors = useColors();
  const color = value >= 80 ? colors.success : value >= 50 ? colors.warning : colors.error;
  return (
    <View style={styles.confidenceContainer}>
      <View style={[styles.confidenceTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.confidenceFill, { width: `${value}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.confidenceLabel, { color }]}>{value}% confidence</Text>
    </View>
  );
}

export default function DetailScreen() {
  const colors = useColors();
  const { scanId, citationId } = useLocalSearchParams<{ scanId: string; citationId: string }>();
  const [citation, setCitation] = useState<Citation | null>(null);

  useEffect(() => {
    loadCitation();
  }, [scanId, citationId]);

  async function loadCitation() {
    const scans = await getScans();
    const scan = scans.find((s) => s.id === scanId);
    if (scan) {
      const found = scan.citations.find((c) => c.id === citationId);
      if (found) setCitation(found);
    }
  }

  async function handleShare() {
    if (!citation) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: `Citation: ${citation.text}\nStatus: ${citation.status.toUpperCase()}\nVerdict: ${citation.verdict}${citation.suggestedFix ? `\nSuggested Fix: ${citation.suggestedFix}` : ""}`,
    });
  }

  if (!citation) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.muted }}>Loading…</Text>
      </ScreenContainer>
    );
  }

  const statusConfig: Record<CitationStatus, { color: string; label: string; emoji: string }> = {
    valid: { color: colors.success, label: "Verified", emoji: "✅" },
    warning: { color: colors.warning, label: "Review Needed", emoji: "⚠️" },
    invalid: { color: colors.error, label: "Invalid / Not Found", emoji: "❌" },
  };
  const config = statusConfig[citation.status];

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Citation Detail</Text>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.shareButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="square.and.arrow.up" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: config.color + "18", borderColor: config.color + "44" }]}>
          <Text style={styles.statusEmoji}>{config.emoji}</Text>
          <View>
            <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
            <ConfidenceMeter value={citation.confidence} />
          </View>
        </View>

        {/* Citation Text */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.muted }]}>CITATION</Text>
          <Text style={[styles.citationText, { color: colors.foreground }]}>{citation.text}</Text>
        </View>

        {/* Verdict */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.muted }]}>VERIFICATION VERDICT</Text>
          <Text style={[styles.verdictText, { color: colors.foreground }]}>{citation.verdict}</Text>
        </View>

        {/* Suggested Fix */}
        {citation.suggestedFix && (
          <View style={[styles.card, { backgroundColor: colors.warning + "10", borderColor: colors.warning + "44" }]}>
            <Text style={[styles.cardTitle, { color: colors.warning }]}>SUGGESTED CORRECTION</Text>
            <Text style={[styles.fixText, { color: colors.foreground }]}>{citation.suggestedFix}</Text>
          </View>
        )}

        {/* Source Link */}
        {citation.sourceUrl && (
          <Pressable
            onPress={() => Linking.openURL(citation.sourceUrl!)}
            style={({ pressed }) => [
              styles.sourceButton,
              { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <IconSymbol name="link" size={16} color={colors.primary} />
            <Text style={[styles.sourceButtonText, { color: colors.primary }]}>View Source</Text>
            <IconSymbol name="chevron.right" size={14} color={colors.primary} />
          </Pressable>
        )}
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
  shareButton: {
    width: 32,
    alignItems: "flex-end",
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  statusEmoji: {
    fontSize: 36,
  },
  statusLabel: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  confidenceContainer: {
    gap: 4,
    width: 180,
  },
  confidenceTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  confidenceFill: {
    height: 6,
    borderRadius: 3,
  },
  confidenceLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  citationText: {
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
  },
  verdictText: {
    fontSize: 14,
    lineHeight: 22,
  },
  fixText: {
    fontSize: 14,
    lineHeight: 22,
    fontStyle: "italic",
  },
  sourceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  sourceButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
});
