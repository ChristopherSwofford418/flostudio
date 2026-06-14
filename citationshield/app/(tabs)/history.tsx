import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getScans, deleteScan, type ScanResult } from "@/lib/scan-store";
import { IconSymbol } from "@/components/ui/icon-symbol";

function StatusBadge({ status }: { status: "clean" | "warning" | "error" }) {
  const colors = useColors();
  const config = {
    clean: { color: colors.success, label: "Clean" },
    warning: { color: colors.warning, label: "Review" },
    error: { color: colors.error, label: "Issues" },
  }[status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: config.color + "22", borderColor: config.color + "55" }]}>
      <Text style={[styles.statusBadgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function ScanRow({ scan, onPress, onDelete }: { scan: ScanResult; onPress: () => void; onDelete: () => void }) {
  const colors = useColors();
  const date = new Date(scan.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const status = scan.invalidCount > 0 ? "error" : scan.warningCount > 0 ? "warning" : "clean";

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Delete Scan", `Remove "${scan.documentName}" from history?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.docIcon, { backgroundColor: colors.primary + "18" }]}>
          <IconSymbol name="doc.text.fill" size={20} color={colors.primary} />
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
            {scan.documentName}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.muted }]}>
            {date} · {scan.totalCount} citations
          </Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <StatusBadge status={status} />
        <IconSymbol name="chevron.right" size={14} color={colors.muted} />
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const [scans, setScans] = useState<ScanResult[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadScans();
    }, [])
  );

  async function loadScans() {
    const data = await getScans();
    setScans(data);
  }

  async function handleDelete(id: string) {
    await deleteScan(id);
    setScans((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <ScreenContainer className="px-5 pt-4">
      <Text style={[styles.title, { color: colors.foreground }]}>Scan History</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        {scans.length} document{scans.length !== 1 ? "s" : ""} scanned · Long-press to delete
      </Text>

      {scans.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.emptyEmoji}>🗂️</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No history yet</Text>
          <Text style={[styles.emptyBody, { color: colors.muted }]}>
            Your scanned documents will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={scans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ScanRow
              scan={item}
              onPress={() => router.push({ pathname: "/scan/results", params: { scanId: item.id } })}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowMeta: {
    fontSize: 12,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 8,
    marginTop: 20,
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
