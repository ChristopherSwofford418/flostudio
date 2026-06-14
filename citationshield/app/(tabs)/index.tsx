import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import {
  getScans,
  getUsage,
  getSubscription,
  canScan,
  FREE_SCAN_LIMIT,
  type ScanResult,
  type UsageData,
  type SubscriptionData,
} from "@/lib/scan-store";
import { IconSymbol } from "@/components/ui/icon-symbol";

function CitationBadge({ status, count }: { status: "valid" | "warning" | "invalid"; count: number }) {
  const colors = useColors();
  const color = status === "valid" ? colors.success : status === "warning" ? colors.warning : colors.error;
  const label = status === "valid" ? "✓" : status === "warning" ? "!" : "✗";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "44" }]}>
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
      <Text style={[styles.badgeCount, { color }]}>{count}</Text>
    </View>
  );
}

function ScanCard({ scan, onPress }: { scan: ScanResult; onPress: () => void }) {
  const colors = useColors();
  const date = new Date(scan.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const allValid = scan.invalidCount === 0 && scan.warningCount === 0;
  const hasErrors = scan.invalidCount > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.scanCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.scanCardHeader}>
        <View style={[styles.statusDot, { backgroundColor: hasErrors ? colors.error : allValid ? colors.success : colors.warning }]} />
        <Text style={[styles.scanCardName, { color: colors.foreground }]} numberOfLines={1}>
          {scan.documentName}
        </Text>
        <IconSymbol name="chevron.right" size={16} color={colors.muted} />
      </View>
      <Text style={[styles.scanCardDate, { color: colors.muted }]}>{date} · {scan.totalCount} citations</Text>
      <View style={styles.badgeRow}>
        {scan.validCount > 0 && <CitationBadge status="valid" count={scan.validCount} />}
        {scan.warningCount > 0 && <CitationBadge status="warning" count={scan.warningCount} />}
        {scan.invalidCount > 0 && <CitationBadge status="invalid" count={scan.invalidCount} />}
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const [recentScans, setRecentScans] = useState<ScanResult[]>([]);
  const [usage, setUsage] = useState<UsageData>({ scansThisMonth: 0, monthYear: "" });
  const [subscription, setSubscription] = useState<SubscriptionData>({ tier: "free" });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [scans, usageData, subData] = await Promise.all([
      getScans(),
      getUsage(),
      getSubscription(),
    ]);
    setRecentScans(scans.slice(0, 5));
    setUsage(usageData);
    setSubscription(subData);
  }

  async function handleScanPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const allowed = await canScan();
    if (!allowed) {
      router.push("/scan/paywall");
    } else {
      router.push("/scan/upload");
    }
  }

  const isFree = subscription.tier === "free";
  const scansLeft = Math.max(0, FREE_SCAN_LIMIT - usage.scansThisMonth);
  const usagePercent = isFree ? Math.min(1, usage.scansThisMonth / FREE_SCAN_LIMIT) : 0;

  return (
    <ScreenContainer className="px-5 pt-4">
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.appTitle, { color: colors.primary }]}>Citation Shield</Text>
          <Text style={[styles.appSubtitle, { color: colors.muted }]}>AI Legal Citation Verifier</Text>
        </View>
        <View style={[styles.tierBadge, { backgroundColor: isFree ? colors.border : colors.accent + "33", borderColor: isFree ? colors.border : colors.accent }]}>
          <Text style={[styles.tierText, { color: isFree ? colors.muted : colors.accent }]}>
            {isFree ? "Free" : subscription.tier === "pro" ? "Pro" : "Law Firm"}
          </Text>
        </View>
      </View>

      {/* Scan CTA */}
      <Pressable
        onPress={handleScanPress}
        style={({ pressed }) => [
          styles.scanButton,
          { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <IconSymbol name="checkmark.shield.fill" size={28} color="#FFFFFF" />
        <Text style={styles.scanButtonText}>Scan New Document</Text>
      </Pressable>

      {/* Usage meter (free tier) */}
      {isFree && (
        <View style={[styles.usageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.usageRow}>
            <Text style={[styles.usageLabel, { color: colors.foreground }]}>Free Scans</Text>
            <Text style={[styles.usageCount, { color: scansLeft === 0 ? colors.error : colors.primary }]}>
              {scansLeft} of {FREE_SCAN_LIMIT} remaining
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${usagePercent * 100}%` as any,
                  backgroundColor: scansLeft === 0 ? colors.error : colors.primary,
                },
              ]}
            />
          </View>
          {scansLeft === 0 && (
            <Pressable
              onPress={() => router.push("/scan/paywall")}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={[styles.upgradeLink, { color: colors.accent }]}>Upgrade to Pro for unlimited scans →</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Recent Scans */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Scans</Text>

      {recentScans.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.emptyEmoji}>📄</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No scans yet</Text>
          <Text style={[styles.emptyBody, { color: colors.muted }]}>
            Upload a legal document to verify its citations.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recentScans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ScanCard
              scan={item}
              onPress={() => router.push({ pathname: "/scan/results", params: { scanId: item.id } })}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          scrollEnabled={false}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  tierText: {
    fontSize: 12,
    fontWeight: "600",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 14,
    marginBottom: 16,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  usageCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  usageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  usageLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  usageCount: {
    fontSize: 13,
    fontWeight: "600",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  upgradeLink: {
    fontSize: 13,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  scanCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  scanCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scanCardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  scanCardDate: {
    fontSize: 12,
    marginLeft: 16,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginLeft: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  badgeCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  emptyBody: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
