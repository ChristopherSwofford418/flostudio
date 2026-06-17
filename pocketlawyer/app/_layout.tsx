import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemeProvider as AppThemeProvider } from "@/lib/theme-provider";
import { isOnboardingComplete } from "@/lib/legal-store";
import { router } from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      const done = await isOnboardingComplete();
      if (!done) {
        router.replace("/onboarding" as any);
      }
      setOnboardingChecked(true);
    }
    if (loaded) {
      SplashScreen.hideAsync();
      checkOnboarding();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding/index" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="health-score" options={{ headerShown: false, presentation: "card" }} />
            <Stack.Screen name="situation-wizard" options={{ headerShown: false, presentation: "card" }} />
            <Stack.Screen name="rights-cards" options={{ headerShown: false, presentation: "card" }} />
            <Stack.Screen name="topic-detail" options={{ headerShown: false, presentation: "card" }} />
            <Stack.Screen name="paywall" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="oauth/callback" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
