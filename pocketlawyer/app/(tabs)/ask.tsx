import { useState, useRef, useEffect, useCallback } from "react";
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import {
  getSessions,
  saveSession,
  deleteSession,
  getUsage,
  incrementQuestionUsage,
  getSubscription,
  FREE_QUESTIONS_PER_DAY,
  type ChatSession,
  type ChatMessage,
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

const SUGGESTIONS = [
  "Can my landlord enter without notice?",
  "What are my rights if I'm fired?",
  "How do I dispute a debt collector?",
  "Is my non-compete enforceable?",
  "What is small claims court?",
  "Can I break my lease legally?",
  "What does 'at-will employment' mean?",
  "How long does eviction take?",
];

// Extended message type to carry AI metadata
interface EnrichedMessage extends ChatMessage {
  followUpQuestions?: string[];
  urgencyFlag?: "none" | "moderate" | "urgent";
  recommendAttorney?: boolean;
  practiceArea?: string;
}

function UrgencyBanner({ flag }: { flag: "none" | "moderate" | "urgent" }) {
  if (flag === "none") return null;
  const isUrgent = flag === "urgent";
  return (
    <View style={[styles.urgencyBanner, isUrgent ? styles.urgencyBannerCritical : styles.urgencyBannerWarning]}>
      <IconSymbol name="exclamationmark.triangle.fill" size={14} color={isUrgent ? CRITICAL : WARNING} />
      <Text style={[styles.urgencyText, { color: isUrgent ? CRITICAL : WARNING }]}>
        {isUrgent
          ? "TIME-SENSITIVE — Act quickly. Legal deadlines may apply."
          : "This situation may have upcoming deadlines. Review carefully."}
      </Text>
    </View>
  );
}

function AttorneyBadge({ practiceArea }: { practiceArea: string }) {
  return (
    <View style={styles.attorneyBadge}>
      <IconSymbol name="person.fill" size={12} color={SUCCESS} />
      <Text style={styles.attorneyBadgeText}>Consider a {practiceArea} attorney</Text>
    </View>
  );
}

function MessageBubble({
  message,
  onFollowUp,
}: {
  message: EnrichedMessage;
  onFollowUp: (q: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <View style={styles.messageGroup}>
      <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <IconSymbol name="shield.fill" size={14} color={GOLD} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          {!isUser && message.practiceArea && message.practiceArea !== "General" && (
            <View style={styles.practiceAreaBadge}>
              <Text style={styles.practiceAreaText}>{message.practiceArea.toUpperCase()}</Text>
            </View>
          )}
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {message.content}
          </Text>
          <Text style={[styles.bubbleTime, isUser && { color: MIDNIGHT + "88" }]}>
            {new Date(message.timestamp).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>

      {/* AI-only enrichments */}
      {!isUser && (
        <>
          {message.urgencyFlag && message.urgencyFlag !== "none" && (
            <UrgencyBanner flag={message.urgencyFlag} />
          )}
          {message.recommendAttorney && message.practiceArea && (
            <AttorneyBadge practiceArea={message.practiceArea} />
          )}
          {message.followUpQuestions && message.followUpQuestions.length > 0 && (
            <View style={styles.followUpsContainer}>
              <Text style={styles.followUpsLabel}>FOLLOW-UP QUESTIONS</Text>
              {message.followUpQuestions.map((q, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.followUpChip, pressed && { opacity: 0.75 }]}
                  onPress={() => onFollowUp(q)}
                >
                  <IconSymbol name="arrow.right.circle.fill" size={14} color={GOLD} />
                  <Text style={styles.followUpText}>{q}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

export default function AskScreen() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [enrichedMessages, setEnrichedMessages] = useState<EnrichedMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [questionsLeft, setQuestionsLeft] = useState(FREE_QUESTIONS_PER_DAY);
  const [isPro, setIsPro] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const askMutation = trpc.legal.ask.useMutation();

  const loadData = useCallback(async () => {
    const [allSessions, usage, sub] = await Promise.all([
      getSessions(),
      getUsage(),
      getSubscription(),
    ]);
    setSessions(allSessions);
    setQuestionsLeft(Math.max(0, FREE_QUESTIONS_PER_DAY - usage.questionsUsed));
    setIsPro(sub.isPro);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync enriched messages when activeSession changes
  useEffect(() => {
    if (!activeSession) {
      setEnrichedMessages([]);
    } else {
      setEnrichedMessages((prev) => {
        // Merge: keep enrichment metadata for existing messages
        const enrichedMap = new Map(prev.map((m) => [m.id, m]));
        return activeSession.messages.map((m) => enrichedMap.get(m.id) ?? m);
      });
    }
  }, [activeSession]);

  function startNewSession() {
    setActiveSession(null);
    setEnrichedMessages([]);
    setShowHistory(false);
  }

  async function handleSend(text?: string) {
    const question = (text ?? input).trim();
    if (!question || isLoading) return;

    if (!isPro && questionsLeft <= 0) {
      router.push("/paywall" as any);
      return;
    }

    let session = activeSession;
    if (!session) {
      session = {
        id: Date.now().toString(),
        title: question.length > 40 ? question.slice(0, 40) + "…" : question,
        createdAt: new Date().toISOString(),
        messages: [],
      };
    }

    const userMsg: EnrichedMessage = {
      id: `${Date.now()}_user`,
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...session.messages, userMsg];
    const updatedSession: ChatSession = {
      ...session,
      messages: updatedMessages,
      title:
        session.messages.length === 0
          ? question.length > 40
            ? question.slice(0, 40) + "…"
            : question
          : session.title,
    };

    setActiveSession(updatedSession);
    setEnrichedMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    await incrementQuestionUsage();
    setQuestionsLeft((prev) => Math.max(0, prev - 1));

    try {
      const history = session.messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await askMutation.mutateAsync({
        question,
        conversationHistory: history,
      });

      const aiMsg: EnrichedMessage = {
        id: `${Date.now()}_ai`,
        role: "assistant",
        content: result.answer,
        timestamp: new Date().toISOString(),
        followUpQuestions: result.followUpQuestions ?? [],
        urgencyFlag: result.urgencyFlag ?? "none",
        recommendAttorney: result.recommendAttorney ?? false,
        practiceArea: result.practiceArea ?? "General",
      };

      const finalMessages = [...updatedMessages, aiMsg];
      const finalSession: ChatSession = {
        ...updatedSession,
        messages: finalMessages,
      };

      setActiveSession(finalSession);
      setEnrichedMessages((prev) => [...prev, aiMsg]);
      await saveSession(finalSession);
      const updated = await getSessions();
      setSessions(updated);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch {
      Alert.alert("Error", "Failed to get a response. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── History Sidebar ──
  if (showHistory) {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.navBar}>
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={() => setShowHistory(false)}>
            <IconSymbol name="xmark" size={22} color={PARCHMENT} />
          </Pressable>
          <Text style={styles.navTitle}>Conversation History</Text>
          <Pressable onPress={startNewSession}>
            <IconSymbol name="plus" size={22} color={GOLD} />
          </Pressable>
        </View>
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 20, gap: 8 }}
          ListEmptyComponent={
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>No conversations yet.</Text>
              <Text style={styles.emptyHistorySubtext}>
                Ask your first legal question to get started.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.historyCard}>
              <Pressable
                style={styles.historyCardMain}
                onPress={() => {
                  setActiveSession(item);
                  setShowHistory(false);
                }}
              >
                <View style={styles.historyCardIcon}>
                  <IconSymbol name="bubble.left.and.bubble.right.fill" size={16} color={GOLD} />
                </View>
                <View style={styles.historyCardInfo}>
                  <Text style={styles.historyCardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.historyCardMeta}>
                    {item.messages.length} messages •{" "}
                    {new Date(item.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={MUTED} />
              </Pressable>
              <Pressable
                style={styles.historyDeleteBtn}
                onPress={() =>
                  Alert.alert("Delete", "Remove this conversation?", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        await deleteSession(item.id);
                        setSessions(await getSessions());
                        if (activeSession?.id === item.id) {
                          setActiveSession(null);
                          setEnrichedMessages([]);
                        }
                      },
                    },
                  ])
                }
              >
                <IconSymbol name="trash.fill" size={14} color={CRITICAL} />
              </Pressable>
            </View>
          )}
        />
      </ScreenContainer>
    );
  }

  // ── Main Chat View ──
  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          onPress={() => setShowHistory(true)}
        >
          <IconSymbol name="clock.fill" size={22} color={MUTED} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text style={styles.navTitle}>AI Legal Assistant</Text>
          {!isPro && (
            <Text style={styles.navSubtitle}>{questionsLeft} questions left today</Text>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.newChatBtn, pressed && { opacity: 0.7 }]}
          onPress={startNewSession}
        >
          <IconSymbol name="plus" size={18} color={GOLD} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {enrichedMessages.length === 0 ? (
          // Empty State
          <ScrollView
            contentContainerStyle={styles.emptyState}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.emptyOrb}>
              <IconSymbol name="shield.fill" size={36} color={GOLD} />
            </View>
            <Text style={styles.emptyTitle}>Ask Any Legal Question</Text>
            <Text style={styles.emptySubtitle}>
              Get expert-level answers about your rights, contracts, employment, housing, and more — backed by real legal standards.
            </Text>

            {/* AI quality indicators */}
            <View style={styles.aiQualityRow}>
              <View style={styles.aiQualityChip}>
                <IconSymbol name="checkmark.seal.fill" size={12} color={SUCCESS} />
                <Text style={styles.aiQualityText}>Cites real laws</Text>
              </View>
              <View style={styles.aiQualityChip}>
                <IconSymbol name="clock.fill" size={12} color={GOLD} />
                <Text style={styles.aiQualityText}>Urgency detection</Text>
              </View>
              <View style={styles.aiQualityChip}>
                <IconSymbol name="person.fill" size={12} color="#7B61FF" />
                <Text style={styles.aiQualityText}>Attorney guidance</Text>
              </View>
            </View>

            <Text style={styles.suggestionsLabel}>POPULAR QUESTIONS</Text>
            <View style={styles.suggestionsGrid}>
              {SUGGESTIONS.map((s, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.suggestionChip, pressed && { opacity: 0.75 }]}
                  onPress={() => handleSend(s)}
                >
                  <IconSymbol name="chevron.right" size={12} color={GOLD} />
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.disclaimer}>
              General legal information only — not legal advice. Consult a licensed attorney for your specific situation.
            </Text>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={enrichedMessages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            ListFooterComponent={
              isLoading ? (
                <View style={styles.typingIndicator}>
                  <View style={styles.aiAvatar}>
                    <IconSymbol name="shield.fill" size={14} color={GOLD} />
                  </View>
                  <View style={styles.typingBubble}>
                    <ActivityIndicator size="small" color={GOLD} />
                    <Text style={styles.typingText}>Researching legal standards...</Text>
                  </View>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                onFollowUp={(q) => handleSend(q)}
              />
            )}
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a legal question..."
            placeholderTextColor={MUTED}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || isLoading) && styles.sendBtnDisabled,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => handleSend()}
            disabled={!input.trim() || isLoading}
          >
            <IconSymbol name="paperplane.fill" size={18} color={MIDNIGHT} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  navCenter: { alignItems: "center" },
  navTitle: { fontSize: 16, fontWeight: "700", color: PARCHMENT },
  navSubtitle: { fontSize: 10, color: MUTED, marginTop: 1 },
  newChatBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GOLD + "22",
    justifyContent: "center",
    alignItems: "center",
  },

  // Empty State
  emptyState: { flexGrow: 1, alignItems: "center", padding: 24, paddingTop: 36 },
  emptyOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: GOLD + "22",
    borderWidth: 2,
    borderColor: GOLD + "44",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: PARCHMENT,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },

  aiQualityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  aiQualityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: NAVY_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aiQualityText: { fontSize: 11, color: PARCHMENT, fontWeight: "500" },

  suggestionsLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GOLD,
    letterSpacing: 1.5,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  suggestionsGrid: { width: "100%", gap: 6, marginBottom: 24 },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: NAVY_CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 12,
  },
  suggestionText: { fontSize: 13, color: PARCHMENT, lineHeight: 20, flex: 1 },
  disclaimer: { fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 18 },

  // Messages
  messageList: { padding: 16, paddingBottom: 8 },
  messageGroup: { marginBottom: 12 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowUser: { flexDirection: "row-reverse" },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GOLD + "22",
    borderWidth: 1,
    borderColor: GOLD + "44",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  bubbleAI: {
    backgroundColor: NAVY_CARD,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: GOLD,
    borderBottomRightRadius: 4,
  },
  practiceAreaBadge: {
    backgroundColor: GOLD + "22",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  practiceAreaText: {
    fontSize: 9,
    fontWeight: "800",
    color: GOLD,
    letterSpacing: 1,
  },
  bubbleText: { fontSize: 14, color: PARCHMENT, lineHeight: 22 },
  bubbleTextUser: { color: MIDNIGHT },
  bubbleTime: { fontSize: 10, color: MUTED, alignSelf: "flex-end" },

  // Urgency Banner
  urgencyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginLeft: 36,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  urgencyBannerCritical: {
    backgroundColor: CRITICAL + "15",
    borderColor: CRITICAL + "44",
  },
  urgencyBannerWarning: {
    backgroundColor: WARNING + "15",
    borderColor: WARNING + "44",
  },
  urgencyText: { fontSize: 11, fontWeight: "600", flex: 1, lineHeight: 16 },

  // Attorney Badge
  attorneyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    marginLeft: 36,
    backgroundColor: SUCCESS + "15",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: SUCCESS + "33",
    alignSelf: "flex-start",
  },
  attorneyBadgeText: { fontSize: 11, color: SUCCESS, fontWeight: "600" },

  // Follow-up Questions
  followUpsContainer: {
    marginTop: 8,
    marginLeft: 36,
    gap: 6,
  },
  followUpsLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: GOLD,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  followUpChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: NAVY_CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD + "33",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  followUpText: { fontSize: 12, color: PARCHMENT, flex: 1, lineHeight: 18 },

  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: NAVY_CARD,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    padding: 12,
  },
  typingText: { fontSize: 13, color: MUTED },

  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: NAVY_BORDER,
    backgroundColor: MIDNIGHT,
  },
  input: {
    flex: 1,
    backgroundColor: NAVY_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: PARCHMENT,
    fontSize: 14,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: GOLD,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },

  // History
  emptyHistory: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyHistoryText: { fontSize: 16, fontWeight: "600", color: PARCHMENT },
  emptyHistorySubtext: { fontSize: 13, color: MUTED, textAlign: "center" },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY_CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
  },
  historyCardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  historyCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GOLD + "22",
    justifyContent: "center",
    alignItems: "center",
  },
  historyCardInfo: { flex: 1 },
  historyCardTitle: { fontSize: 14, fontWeight: "600", color: PARCHMENT, marginBottom: 2 },
  historyCardMeta: { fontSize: 11, color: MUTED },
  historyDeleteBtn: { padding: 14 },
});
