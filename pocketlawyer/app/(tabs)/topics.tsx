import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";

const GOLD = "#C9A84C";
const GOLD_DIM = "rgba(201,168,76,0.10)";
const GOLD_BORDER = "rgba(201,168,76,0.22)";
const MIDNIGHT = "#0A0E1A";
const SURFACE = "#111827";
const MUTED = "#8A9BB5";
const BORDER = "#1E2D45";
const PARCHMENT = "#F0EAD6";

interface LegalTopic {
  id: string;
  emoji: string;
  title: string;
  description: string;
  category: string;
  color: string;
  quickQuestions: string[];
}

const TOPICS: LegalTopic[] = [
  {
    id: "employment",
    emoji: "💼",
    title: "Employment & Workplace",
    description: "Wrongful termination, harassment, overtime, and employee rights",
    category: "Personal",
    color: "#3B82F6",
    quickQuestions: [
      "Can my employer fire me without a reason?",
      "What are my rights if I'm being harassed at work?",
      "Am I entitled to overtime pay?",
      "What is wrongful termination?",
    ],
  },
  {
    id: "housing",
    emoji: "🏠",
    title: "Housing & Tenant Rights",
    description: "Landlord-tenant laws, eviction, deposits, and habitability",
    category: "Personal",
    color: "#10B981",
    quickQuestions: [
      "Can my landlord enter my apartment without notice?",
      "What can my landlord deduct from my security deposit?",
      "How much notice does my landlord need before eviction?",
      "Can my landlord raise my rent mid-lease?",
    ],
  },
  {
    id: "family",
    emoji: "👨‍👩‍👧",
    title: "Family Law",
    description: "Divorce, child custody, support, and domestic matters",
    category: "Personal",
    color: "#EC4899",
    quickQuestions: [
      "How does child custody work in a divorce?",
      "What is the difference between legal and physical custody?",
      "Can I modify a child support order?",
      "How is property divided in a divorce?",
    ],
  },
  {
    id: "contracts",
    emoji: "📋",
    title: "Contracts & Agreements",
    description: "Binding agreements, breach of contract, and enforcement",
    category: "Business",
    color: "#F59E0B",
    quickQuestions: [
      "What makes a contract legally binding?",
      "Can I get out of a contract I signed?",
      "What is a non-compete clause?",
      "Is a verbal agreement legally enforceable?",
    ],
  },
  {
    id: "business",
    emoji: "🏢",
    title: "Business Law",
    description: "LLCs, corporations, trademarks, NDAs, and disputes",
    category: "Business",
    color: "#8B5CF6",
    quickQuestions: [
      "What is the difference between an LLC and a corporation?",
      "Do I need a business license?",
      "What is a trademark and how do I get one?",
      "What is an NDA?",
    ],
  },
  {
    id: "debt",
    emoji: "💳",
    title: "Debt & Collections",
    description: "Debt collectors, bankruptcy, wage garnishment, and creditors",
    category: "Finance",
    color: "#EF4444",
    quickQuestions: [
      "Can a debt collector call me at work?",
      "What is the statute of limitations on debt?",
      "Can creditors garnish my wages?",
      "What is the difference between Chapter 7 and Chapter 13 bankruptcy?",
    ],
  },
  {
    id: "estate",
    emoji: "📜",
    title: "Estate Planning",
    description: "Wills, trusts, power of attorney, and probate",
    category: "Finance",
    color: "#84CC16",
    quickQuestions: [
      "Do I need a will?",
      "What is the difference between a will and a trust?",
      "What is a power of attorney?",
      "What happens if I die without a will?",
    ],
  },
  {
    id: "criminal",
    emoji: "⚖️",
    title: "Criminal Law",
    description: "Miranda rights, bail, misdemeanors, felonies, and expungement",
    category: "Rights",
    color: "#C9A84C",
    quickQuestions: [
      "What are my Miranda rights?",
      "Do I have to answer police questions?",
      "What is the difference between a misdemeanor and felony?",
      "What is an expungement?",
    ],
  },
  {
    id: "immigration",
    emoji: "🌎",
    title: "Immigration",
    description: "Visas, green cards, citizenship, DACA, and asylum",
    category: "Rights",
    color: "#06B6D4",
    quickQuestions: [
      "What is the difference between a green card and citizenship?",
      "What rights do undocumented immigrants have?",
      "How does the naturalization process work?",
      "What is asylum and how do I apply?",
    ],
  },
];

const CATEGORIES = ["Personal", "Business", "Finance", "Rights"];

export default function TopicsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleTopicPress = (topic: LegalTopic) => {
    router.push({
      pathname: "/topic-detail" as any,
      params: {
        id: topic.id,
        title: topic.title,
        description: topic.description,
        color: topic.color,
        quickQuestions: JSON.stringify(topic.quickQuestions),
      },
    });
  };

  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    topics: TOPICS.filter((t) => t.category === cat),
  }));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Legal Topics</Text>
          <Text style={styles.headerSubtitle}>Browse by area of law</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{TOPICS.length} Topics</Text>
        </View>
      </View>
      <View style={styles.goldRule} />

      <FlatList
        data={grouped}
        keyExtractor={(item) => item.category}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: group }) => (
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <View style={styles.categoryDot} />
              <Text style={styles.categoryLabel}>{group.category.toUpperCase()}</Text>
            </View>

            {group.topics.map((topic) => (
              <Pressable
                key={topic.id}
                onPress={() => handleTopicPress(topic)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
                ]}
              >
                <View style={[styles.cardAccent, { backgroundColor: topic.color }]} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <View style={[styles.emojiWrap, { backgroundColor: topic.color + "18" }]}>
                      <Text style={styles.cardEmoji}>{topic.emoji}</Text>
                    </View>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle}>{topic.title}</Text>
                      <Text style={styles.cardDesc} numberOfLines={2}>{topic.description}</Text>
                    </View>
                    <IconSymbol name="chevron.right" size={16} color="#3D4F6B" />
                  </View>
                  <View style={styles.cardFooter}>
                    <View style={[styles.questionsBadge, { backgroundColor: topic.color + "14", borderColor: topic.color + "30" }]}>
                      <Text style={[styles.questionsBadgeText, { color: topic.color }]}>
                        {topic.quickQuestions.length} questions
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={styles.footerDivider} />
            <Text style={styles.footerText}>
              Don't see your topic? Tap Ask to type any legal question.
            </Text>
          </View>
        }
      />
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
  headerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  headerBadgeText: { fontSize: 12, fontWeight: "700", color: GOLD },
  goldRule: { height: 1, backgroundColor: GOLD_BORDER },
  listContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 },
  categorySection: { marginBottom: 24 },
  categoryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  categoryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  categoryLabel: { fontSize: 11, fontWeight: "700", color: GOLD, letterSpacing: 1.8 },
  card: {
    flexDirection: "row",
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardAccent: { width: 3 },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  emojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 22 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: PARCHMENT, lineHeight: 20 },
  cardDesc: { fontSize: 12, color: MUTED, lineHeight: 17, marginTop: 2 },
  cardFooter: { marginTop: 10 },
  questionsBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  questionsBadgeText: { fontSize: 11, fontWeight: "600" },
  footer: { alignItems: "center", paddingTop: 8, gap: 12 },
  footerDivider: { width: 40, height: 1, backgroundColor: BORDER },
  footerText: { fontSize: 12, color: "#3D4F6B", textAlign: "center", lineHeight: 18 },
});
