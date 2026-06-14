import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { canScan } from "@/lib/scan-store";

type InputMode = "file" | "paste";

export default function UploadScreen() {
  const colors = useColors();
  const [mode, setMode] = useState<InputMode>("file");
  const [pastedText, setPastedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ name: string; uri: string; size?: number; mimeType?: string } | null>(null);

  async function handleFilePick() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedFile({ name: asset.name, uri: asset.uri, size: asset.size, mimeType: asset.mimeType ?? "application/pdf" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert("Error", "Could not open file picker.");
    }
  }

  async function handleScan() {
    const allowed = await canScan();
    if (!allowed) {
      router.replace("/scan/paywall");
      return;
    }

    if (mode === "file" && !selectedFile) {
      Alert.alert("No File Selected", "Please select a document to scan.");
      return;
    }
    if (mode === "paste" && pastedText.trim().length < 50) {
      Alert.alert("Too Short", "Please paste at least 50 characters of legal text.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const documentName = mode === "file" ? selectedFile!.name : "Pasted Text";
    const content = mode === "file" ? selectedFile!.uri : pastedText;

    router.push({
      pathname: "/scan/processing",
      params: {
        documentName,
        content,
        mode,
        mimeType: mode === "file" ? (selectedFile!.mimeType ?? "application/pdf") : "text/plain",
      },
    });
  }

  const charCount = pastedText.length;
  const wordCount = pastedText.trim() ? pastedText.trim().split(/\s+/).length : 0;

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <IconSymbol name="chevron.left" size={22} color={colors.primary} />
              <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
            </Pressable>
            <Text style={[styles.title, { color: colors.foreground }]}>Scan Document</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Mode Selector */}
          <View style={[styles.modeSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(["file", "paste"] as InputMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[
                  styles.modeTab,
                  mode === m && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={[styles.modeTabText, { color: mode === m ? "#FFFFFF" : colors.muted }]}>
                  {m === "file" ? "📎 Upload File" : "📋 Paste Text"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* File Mode */}
          {mode === "file" && (
            <View style={styles.fileSection}>
              <Pressable
                onPress={handleFilePick}
                style={({ pressed }) => [
                  styles.dropZone,
                  {
                    backgroundColor: selectedFile ? colors.primary + "10" : colors.surface,
                    borderColor: selectedFile ? colors.primary : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {selectedFile ? (
                  <>
                    <IconSymbol name="doc.fill" size={40} color={colors.primary} />
                    <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={2}>
                      {selectedFile.name}
                    </Text>
                    {selectedFile.size && (
                      <Text style={[styles.fileSize, { color: colors.muted }]}>
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </Text>
                    )}
                    <Text style={[styles.tapToChange, { color: colors.primary }]}>Tap to change</Text>
                  </>
                ) : (
                  <>
                    <IconSymbol name="arrow.up.doc.fill" size={40} color={colors.muted} />
                    <Text style={[styles.dropTitle, { color: colors.foreground }]}>Select a Document</Text>
                    <Text style={[styles.dropSubtitle, { color: colors.muted }]}>
                      PDF, DOCX, or TXT supported
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* Paste Mode */}
          {mode === "paste" && (
            <View style={styles.pasteSection}>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholder="Paste your legal document text here..."
                placeholderTextColor={colors.muted}
                multiline
                value={pastedText}
                onChangeText={setPastedText}
                textAlignVertical="top"
                returnKeyType="default"
              />
              <Text style={[styles.charCount, { color: colors.muted }]}>
                {wordCount} words · {charCount} characters
              </Text>
            </View>
          )}

          {/* Scan Button */}
          <Pressable
            onPress={handleScan}
            style={({ pressed }) => [
              styles.scanButton,
              {
                backgroundColor: colors.primary,
                transform: [{ scale: pressed ? 0.97 : 1 }],
                opacity: (mode === "file" && !selectedFile) || (mode === "paste" && charCount < 50) ? 0.5 : 1,
              },
            ]}
          >
            <IconSymbol name="checkmark.shield.fill" size={22} color="#FFFFFF" />
            <Text style={styles.scanButtonText}>Scan Citations</Text>
          </Pressable>

          <Text style={[styles.disclaimer, { color: colors.muted }]}>
            Your document is processed securely and not stored on our servers.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 60,
  },
  backText: {
    fontSize: 16,
    fontWeight: "500",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  modeSelector: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  modeTabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  fileSection: {
    marginBottom: 20,
  },
  dropZone: {
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    padding: 40,
    alignItems: "center",
    gap: 10,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  fileSize: {
    fontSize: 13,
  },
  tapToChange: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
  },
  dropTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  dropSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  pasteSection: {
    marginBottom: 20,
    gap: 8,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    lineHeight: 22,
    minHeight: 200,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  disclaimer: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
