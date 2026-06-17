import { useState, useRef } from "react";
import {
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
} from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { getBookmarkedCards, toggleCardBookmark, type RightsCard } from "@/lib/legal-store";
import { useEffect } from "react";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Color constants ──────────────────────────────────────────────────────────
const MIDNIGHT = "#0A0E1A";
const NAVY_CARD = "#111827";
const NAVY_BORDER = "#1E2D45";
const GOLD = "#C9A84C";
const PARCHMENT = "#F5EDD6";
const MUTED = "#7A8FA6";

const CATEGORIES = [
  { id: "Tenant Rights", emoji: "🏠", color: "#4CAF7D" },
  { id: "Employee Rights", emoji: "💼", color: "#7B61FF" },
  { id: "Consumer Rights", emoji: "🛡️", color: "#E05252" },
  { id: "Criminal Rights", emoji: "⚖️", color: "#E8A84C" },
  { id: "Family Rights", emoji: "👨‍👩‍👧", color: "#FF6B9D" },
  { id: "Business Rights", emoji: "🏢", color: "#00BCD4" },
];

export default function RightsCardsScreen() {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [cards, setCards] = useState<RightsCard[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const generateMutation = trpc.legal.generateRightsCards.useMutation();

  useEffect(() => {
    getBookmarkedCards().then(setBookmarks);
  }, []);

  async function loadCards(category: typeof CATEGORIES[0]) {
    setSelectedCategory(category);
    setCards([]);
    setCurrentIndex(0);
    setLoading(true);
    try {
      const result = await generateMutation.mutateAsync({
        category: category.id,
        count: 6,
      });
      setCards(result.cards.map((c) => ({ ...c, isBookmarked: false })) as RightsCard[]);
    } catch {
      Alert.alert("Error", "Failed to load rights cards. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBookmark(cardId: string) {
    const isNowBookmarked = await toggleCardBookmark(cardId);
    setBookmarks((prev) =>
      isNowBookmarked ? [...prev, cardId] : prev.filter((id) => id !== cardId)
    );
  }

  function handleNext() {
    if (currentIndex < cards.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    }
  }

  function handlePrev() {
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev);
      flatListRef.current?.scrollToIndex({ index: prev, animated: true });
    }
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={styles.navBar}>
        <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]} onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={24} color={PARCHMENT} />
        </Pressable>
        <Text style={styles.navTitle}>Know Your Rights</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Daily Legal Education</Text>
        <Text style={styles.subheading}>
          Swipe through bite-sized legal rights cards. Tap a category to explore.
        </Text>

        {/* Category Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {CATEGORIES.map((cat) => {
            const selected = selectedCategory.id === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={({ pressed }) => [
                  styles.categoryPill,
                  selected && { backgroundColor: cat.color, borderColor: cat.color },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => loadCards(cat)}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[styles.categoryPillText, selected && { color: MIDNIGHT }]}>
                  {cat.id}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Cards Area */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={GOLD} size="large" />
            <Text style={styles.loadingText}>Loading {selectedCategory.id} cards...</Text>
          </View>
        ) : cards.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>{selectedCategory.emoji}</Text>
            <Text style={styles.emptyTitle}>{selectedCategory.id}</Text>
            <Text style={styles.emptySubtitle}>
              Tap a category above to load your rights cards.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.loadBtn, { backgroundColor: selectedCategory.color }, pressed && { opacity: 0.85 }]}
              onPress={() => loadCards(selectedCategory)}
            >
              <Text style={styles.loadBtnText}>Load Cards</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Progress */}
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                {currentIndex + 1} of {cards.length}
              </Text>
              <View style={styles.progressBar}>
                {cards.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.progressDot,
                      i === currentIndex && { backgroundColor: selectedCategory.color, width: 16 },
                      i < currentIndex && { backgroundColor: selectedCategory.color + "66" },
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* Card Carousel */}
            <FlatList
              ref={flatListRef}
              data={cards}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isBookmarked = bookmarks.includes(item.id);
                return (
                  <View style={[styles.card, { width: SCREEN_WIDTH - 40 }]}>
                    <View style={[styles.cardAccent, { backgroundColor: selectedCategory.color }]} />
                    <View style={styles.cardContent}>
                      <Text style={styles.cardEmoji}>{item.emoji}</Text>
                      <Text style={styles.cardCategory}>{item.category}</Text>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardBody}>{item.content}</Text>
                      {(item as any).legalBasis ? (
                        <View style={styles.legalBasisRow}>
                          <IconSymbol name="book.fill" size={11} color={GOLD} />
                          <Text style={styles.legalBasisText}>{(item as any).legalBasis}</Text>
                        </View>
                      ) : null}
                      {(item as any).actionableStep ? (
                        <View style={styles.actionableRow}>
                          <Text style={styles.actionableLabel}>ACTION</Text>
                          <Text style={styles.actionableText}>{(item as any).actionableStep}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.cardActions}>
                      <Pressable
                        style={({ pressed }) => [styles.cardActionBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => handleBookmark(item.id)}
                      >
                        <IconSymbol
                          name={isBookmarked ? "bookmark.fill" : "bookmark"}
                          size={20}
                          color={isBookmarked ? GOLD : MUTED}
                        />
                        <Text style={[styles.cardActionText, isBookmarked && { color: GOLD }]}>
                          {isBookmarked ? "Saved" : "Save"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.cardActionBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => router.push("/(tabs)/ask" as any)}
                      >
                        <IconSymbol name="bubble.left.and.bubble.right.fill" size={20} color={MUTED} />
                        <Text style={styles.cardActionText}>Ask AI</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />

            {/* Navigation Arrows */}
            <View style={styles.navArrows}>
              <Pressable
                style={({ pressed }) => [
                  styles.navArrow,
                  currentIndex === 0 && styles.navArrowDisabled,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handlePrev}
                disabled={currentIndex === 0}
              >
                <IconSymbol name="chevron.left" size={22} color={currentIndex === 0 ? NAVY_BORDER : PARCHMENT} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.navArrowPrimary,
                  { backgroundColor: selectedCategory.color },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleNext}
                disabled={currentIndex === cards.length - 1}
              >
                <Text style={styles.navArrowPrimaryText}>
                  {currentIndex === cards.length - 1 ? "Done" : "Next →"}
                </Text>
              </Pressable>
            </View>

            {/* Reload */}
            <Pressable
              style={({ pressed }) => [styles.reloadBtn, pressed && { opacity: 0.7 }]}
              onPress={() => loadCards(selectedCategory)}
            >
              <IconSymbol name="arrow.clockwise" size={14} color={MUTED} />
              <Text style={styles.reloadText}>Load new cards</Text>
            </Pressable>
          </>
        )}

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

  heading: { fontSize: 24, fontWeight: "800", color: PARCHMENT, marginBottom: 6 },
  subheading: { fontSize: 13, color: MUTED, lineHeight: 20, marginBottom: 16 },

  categoryRow: { gap: 8, paddingBottom: 16 },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: NAVY_CARD,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
  },
  categoryEmoji: { fontSize: 14 },
  categoryPillText: { fontSize: 12, fontWeight: "600", color: PARCHMENT },

  loadingContainer: { alignItems: "center", paddingVertical: 60, gap: 16 },
  loadingText: { fontSize: 14, color: MUTED },

  emptyContainer: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: PARCHMENT },
  emptySubtitle: { fontSize: 13, color: MUTED, textAlign: "center", lineHeight: 20 },
  loadBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  loadBtnText: { fontSize: 14, fontWeight: "700", color: MIDNIGHT },

  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  progressText: { fontSize: 12, color: MUTED },
  progressBar: { flexDirection: "row", gap: 4, alignItems: "center" },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: NAVY_BORDER,
  },

  card: {
    backgroundColor: NAVY_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    overflow: "hidden",
    marginBottom: 16,
  },
  cardAccent: { height: 4 },
  cardContent: { padding: 24, gap: 8 },
  cardEmoji: { fontSize: 36 },
  cardCategory: { fontSize: 11, fontWeight: "700", color: GOLD, letterSpacing: 1.5, textTransform: "uppercase" },
  cardTitle: { fontSize: 20, fontWeight: "800", color: PARCHMENT, lineHeight: 28 },
  cardBody: { fontSize: 14, color: MUTED, lineHeight: 24, marginTop: 4 },
  cardActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: NAVY_BORDER,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 24,
  },
  cardActionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardActionText: { fontSize: 13, color: MUTED, fontWeight: "500" },

  navArrows: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navArrow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: NAVY_CARD,
    borderWidth: 1,
    borderColor: NAVY_BORDER,
    justifyContent: "center",
    alignItems: "center",
  },
  navArrowDisabled: { opacity: 0.3 },
  navArrowPrimary: {
    flex: 1,
    marginLeft: 12,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  navArrowPrimaryText: { fontSize: 15, fontWeight: "700", color: MIDNIGHT },

  reloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  reloadText: { fontSize: 12, color: MUTED },

  legalBasisRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  legalBasisText: { fontSize: 10, color: GOLD, fontStyle: "italic", flex: 1 },

  actionableRow: {
    backgroundColor: "#1A2540",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    gap: 4,
  },
  actionableLabel: { fontSize: 9, fontWeight: "800", color: GOLD, letterSpacing: 1.5 },
  actionableText: { fontSize: 12, color: PARCHMENT, lineHeight: 18 },
});
