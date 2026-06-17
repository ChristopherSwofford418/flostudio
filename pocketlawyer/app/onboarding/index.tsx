import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { markOnboardingComplete } from "@/lib/legal-store";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const GOLD = "#C9A84C";
const GOLD_DIM = "rgba(201,168,76,0.12)";
const GOLD_BORDER = "rgba(201,168,76,0.28)";
const MIDNIGHT = "#0A0E1A";
const SURFACE = "#111827";
const MUTED = "#8A9BB5";
const BORDER = "#1E2D45";
const PARCHMENT = "#F0EAD6";

const SLIDES = [
  {
    id: "1",
    emoji: "⚖️",
    title: "Your Personal\nLegal Counsel",
    subtitle:
      "Get clear, instant answers to your legal questions — anytime, anywhere. No appointments. No billable hours.",
    accent: "#C9A84C",
  },
  {
    id: "2",
    emoji: "📋",
    title: "Understand Any\nDocument",
    subtitle:
      "Paste a contract, lease, or NDA and get an AI-powered breakdown — key clauses, red flags, and plain-English explanations.",
    accent: "#3B82F6",
  },
  {
    id: "3",
    emoji: "🔒",
    title: "Private &\nConfidential",
    subtitle:
      "Your questions stay on your device. We never share your data. Your legal matters are yours alone.",
    accent: "#2ECC8F",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const handleNext = async () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      await markOnboardingComplete();
      router.replace("/(tabs)" as any);
    }
  };

  const handleSkip = async () => {
    await markOnboardingComplete();
    router.replace("/(tabs)" as any);
  };

  const currentSlide = SLIDES[currentIndex];

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      {/* Skip */}
      {currentIndex < SLIDES.length - 1 && (
        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
            {/* Glow orb */}
            <View style={[styles.glowOrb, { backgroundColor: item.accent + "10", borderColor: item.accent + "25" }]}>
              <View style={[styles.glowOrbInner, { backgroundColor: item.accent + "18", borderColor: item.accent + "40" }]}>
                <Text style={styles.slideEmoji}>{item.emoji}</Text>
              </View>
            </View>

            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentIndex
                ? [styles.dotActive, { backgroundColor: currentSlide.accent }]
                : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      {/* CTA */}
      <View style={styles.ctaArea}>
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: currentSlide.accent },
            pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
          ]}
        >
          <Text style={styles.ctaBtnText}>
            {currentIndex < SLIDES.length - 1 ? "Continue →" : "Get Started →"}
          </Text>
        </Pressable>

        {currentIndex === SLIDES.length - 1 && (
          <Text style={styles.disclaimer}>
            General legal information only — not legal advice.{"\n"}Consult a licensed attorney for your specific situation.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: MIDNIGHT,
    alignItems: "center",
  },
  skipBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  skipText: { fontSize: 14, color: MUTED, fontWeight: "500" },

  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 0,
  },
  glowOrb: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 44,
  },
  glowOrbInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  slideEmoji: { fontSize: 52 },
  slideTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: PARCHMENT,
    textAlign: "center",
    letterSpacing: -0.8,
    lineHeight: 42,
    marginBottom: 18,
  },
  slideSubtitle: {
    fontSize: 16,
    color: MUTED,
    textAlign: "center",
    lineHeight: 26,
    maxWidth: 320,
  },

  dotsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 32,
  },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 24 },
  dotInactive: { width: 6, backgroundColor: BORDER },

  ctaArea: { width: "100%", paddingHorizontal: 24, alignItems: "center", gap: 16 },
  ctaBtn: {
    width: "100%",
    paddingVertical: 17,
    borderRadius: 16,
    alignItems: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  ctaBtnText: { fontSize: 17, fontWeight: "800", color: MIDNIGHT, letterSpacing: 0.2 },
  disclaimer: {
    fontSize: 11,
    color: "#3D4F6B",
    textAlign: "center",
    lineHeight: 17,
  },
});
