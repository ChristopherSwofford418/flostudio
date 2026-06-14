import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getScans, type ScanResult, type Citation, type CitationStatus } from "@/lib/scan-store";
import { IconSymbol } from "@/components/ui/icon-symbol";

function StatusIcon({ status }: { status: CitationStatus }) {
  const colors = useColors();
  const config = {
    valid: { icon: "checkmark.circle.fill" as const, color: colors.success },
    warning: { icon: "exclamationmark.triangle.fill" as const, color: colors.warning },
    invalid: { icon: "xmark.circle.fill" as const, color: colors.error },
  }[status];
  return <IconSymbol name={config.icon} size={22} color={config.color} />;
}

function CitationRow({ citation, onPress }: { citation: Citation; onPress: () => void }) {
  const colors = useColors();
  const borderColor = {
    valid: colors.success,
    warning: colors.warning,
    invalid: colors.error,
  }[citation.status];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.citationRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftColor: borderColor,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.citationLeft}>
        <StatusIcon status={citation.status} />
        <View style={styles.citationInfo}>
          <Text style={[styles.citationText, { color: colors.foreground }]} numberOfLines={2}>
            {citation.text}
          </Text>
          <Text style={[styles.citationVerdict, { color: colors.muted }]} numberOfLines={1}>
            {citation.verdict}
          </Text>
        </View>
      </View>
      <IconSymbol name="chevron.right" size={14} color={colors.muted} />
    </Pressable>
  );
}

function SummaryCard({ scan }: { scan: ScanResult }) {
  const colors = useColors();
  const allValid = scan.invalidCount === 0 && scan.warningCount === 0;
  const hasErrors = scan.invalidCount > 0;

  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.summaryHeader}>
        <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Verification Summary</Text>
        <View
          style={[
            styles.overallBadge,
            {
              backgroundColor: hasErrors ? colors.error + "22" : allValid ? colors.success + "22" : colors.warning + "22",
              borderColor: hasErrors ? colors.error + "55" : allValid ? colors.success + "55" : colors.warning + "55",
            },
          ]}
        >
          <Text
            style={[
              styles.overallBadgeText,
              { color: hasErrors ? colors.error : allValid ? colors.success : colors.warning },
            ]}
          >
            {hasErrors ? "Issues Found" : allValid ? "All Clear" : "Review Needed"}
          </Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.success }]}>{scan.validCount}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Valid</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.warning }]}>{scan.warningCount}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Review</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.error }]}>{scan.invalidCount}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Invalid</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.foreground }]}>{scan.totalCount}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Total</Text>
        </View>
      </View>
    </View>
  );
}

export default function ResultsScreen() {
  const colors = useColors();
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  useEffect(() => {
    loadScan();
  }, [scanId]);

  async function loadScan() {
    const scans = await getScans();
    const found = scans.find((s) => s.id === scanId);
    if (found) setScan(found);
  }

  async function handleShare() {
    if (!scan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines = [
      `Citation Shield Report — ${scan.documentName}`,
      `Date: ${new Date(scan.createdAt).toLocaleDateString()}`,
      `Total: ${scan.totalCount} | Valid: ${scan.validCount} | Review: ${scan.warningCount} | Invalid: ${scan.invalidCount}`,
      "",
      ...scan.citations.map(
        (c, i) =>
          `${i + 1}. [${c.status.toUpperCase()}] ${c.text}\n   ${c.verdict}`
      ),
    ];
    await Share.share({ message: lines.join("\n") });
  }

  if (!scan) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.muted }}>Loading results…</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={22} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Home</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          Results
        </Text>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.shareButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="square.and.arrow.up" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <FlatList
        data={scan.citations}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.docName, { color: colors.muted }]} numberOfLines={1}>
              {scan.documentName}
            </Text>
            <SummaryCard scan={scan} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Citations</Text>
          </View>
        }
        renderItem={({ item }) => (
          <CitationRow
            citation={item}
            onPress={() => {
              router.push({ pathname: "/scan/detail", params: { scanId, citationId: item.id } });
            }}
          />
        )}
        ListFooterComponent={
          <Pressable
            onPress={() => router.push("/scan/upload")}
            style={({ pressed }) => [
              styles.scanAnotherButton,
              { borderColor: colors.primary, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={[styles.scanAnotherText, { color: colors.primary }]}>Scan Another Document</Text>
          </Pressable>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 70,
  },
  backText: {
    fontSize: 16,
    fontWeight: "500",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  shareButton: {
    width: 70,
    alignItems: "flex-end",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listHeader: {
    gap: 12,
    marginBottom: 16,
  },
  docName: {
    fontSize: 13,
    textAlign: "center",
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  overallBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  overallBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 4,
  },
  citationRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  citationLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  citationInfo: {
    flex: 1,
    gap: 4,
  },
  citationText: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  citationVerdict: {
    fontSize: 12,
    lineHeight: 16,
  },
  scanAnotherButton: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  scanAnotherText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
