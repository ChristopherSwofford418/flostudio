import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { incrementUsage, saveScan, type ScanResult } from "@/lib/scan-store";
import { trpc } from "@/lib/trpc";

const STAGES = [
  "Extracting citations…",
  "Verifying sources…",
  "Cross-referencing databases…",
  "Generating report…",
];

export default function ProcessingScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{
    documentName: string;
    content: string;
    mode: string;
    mimeType?: string;
  }>();
  const [stage, setStage] = useState(0);
  const cancelledRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const hasStarted = useRef(false);

  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Stage cycling
  useEffect(() => {
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (stage + 1) / STAGES.length,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [stage]);

  function handleError(message?: string) {
    if (cancelledRef.current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(
      "Verification Failed",
      message || "Could not verify citations. Please check your internet connection and try again.",
      [{ text: "OK", onPress: () => router.back() }]
    );
  }

  const verifyText = trpc.citations.verifyText.useMutation({
    onSuccess: async (data: ScanResult) => {
      if (cancelledRef.current) return;
      await incrementUsage();
      await saveScan(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/scan/results", params: { scanId: data.id } });
    },
    onError: (err) => {
      if (cancelledRef.current) return;
      handleError(err?.message);
    },
  });

  const verifyFile = trpc.citations.verifyFile.useMutation({
    onSuccess: async (data: ScanResult) => {
      if (cancelledRef.current) return;
      await incrementUsage();
      await saveScan(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/scan/results", params: { scanId: data.id } });
    },
    onError: (err) => {
      if (cancelledRef.current) return;
      handleError(err?.message);
    },
  });

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    startVerification();
  }, []);

  async function startVerification() {
    const mode = params.mode || "paste";
    const documentName = params.documentName || "Document";

    if (mode === "paste") {
      verifyText.mutate({
        documentName,
        content: params.content || "",
      });
    } else {
      // File mode: read the file as base64 and send to server for extraction
      try {
        const uri = params.content || "";
        const mimeType = params.mimeType || "application/pdf";
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        verifyFile.mutate({ documentName, base64, mimeType });
      } catch {
        handleError("Could not read the selected file. Please try again or paste the text directly.");
      }
    }
  }

  function handleCancel() {
    cancelledRef.current = true;
    router.back();
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-background">
      <View style={styles.container}>
        {/* Animated Shield */}
        <Animated.View style={[styles.shieldContainer, { transform: [{ scale: pulseAnim }] }]}>
          <View style={[styles.shieldBg, { backgroundColor: colors.primary + "18" }]}>
            <Text style={styles.shieldEmoji}>🛡️</Text>
          </View>
        </Animated.View>

        <Text style={[styles.title, { color: colors.foreground }]}>Verifying Citations</Text>
        <Text style={[styles.docName, { color: colors.muted }]} numberOfLines={1}>
          {params.documentName}
        </Text>

        {/* Progress Bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>

        {/* Stage Label */}
        <Text style={[styles.stageText, { color: colors.muted }]}>{STAGES[stage]}</Text>

        {/* Cancel */}
        <Pressable
          onPress={handleCancel}
          style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  shieldContainer: {
    marginBottom: 8,
  },
  shieldBg: {
    width: 120,
    height: 120,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  shieldEmoji: {
    fontSize: 60,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  docName: {
    fontSize: 14,
    textAlign: "center",
    maxWidth: 280,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  stageText: {
    fontSize: 14,
    textAlign: "center",
  },
  cancelButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
