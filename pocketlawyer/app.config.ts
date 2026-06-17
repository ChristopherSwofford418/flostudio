// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const env = {
  appName: "PocketLawyer",
  appSlug: "pocketlawyer",
  owner: "cswofford",
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663747676936/RRyRR2r653oYHaMMETFRjb/pocketlawyer-icon-EtPMhFhJBy6SBFvPcgKTSE.png",
  scheme: "pocketlawyer",
  iosBundleId: "io.pocketlawyer.app",
  androidPackage: "io.pocketlawyer.app",
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  owner: env.owner,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "dark",
  description: "PocketLawyer is your AI-powered personal legal assistant. Get instant answers to legal questions, analyze contracts and documents, understand your rights, and navigate any legal situation — all in your pocket. Powered by senior attorney-level AI that cites real laws and statutes.",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription:
        "PocketLawyer needs access to your photo library to let you upload documents for AI legal analysis.",
      NSCameraUsageDescription:
        "PocketLawyer needs camera access to photograph and scan legal documents.",
      NSMicrophoneUsageDescription:
        "PocketLawyer does not use the microphone. This permission is included by a dependency.",
      UIFileSharingEnabled: true,
      LSSupportsOpeningDocumentsInPlace: false,
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: "PDF Document",
          CFBundleTypeRole: "Viewer",
          LSHandlerRank: "Alternate",
          LSItemContentTypes: ["com.adobe.pdf"],
        },
        {
          CFBundleTypeName: "Word Document",
          CFBundleTypeRole: "Viewer",
          LSHandlerRank: "Alternate",
          LSItemContentTypes: [
            "org.openxmlformats.wordprocessingml.document",
            "com.microsoft.word.doc",
          ],
        },
        {
          CFBundleTypeName: "Plain Text",
          CFBundleTypeRole: "Viewer",
          LSHandlerRank: "Alternate",
          LSItemContentTypes: ["public.plain-text"],
        },
      ],
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#1A3C6E",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS", "READ_EXTERNAL_STORAGE", "READ_MEDIA_IMAGES"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: env.scheme, host: "*" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    ["expo-document-picker", { iCloudContainerEnvironment: "Production" }],
    ["expo-audio", { microphonePermission: "PocketLawyer does not use the microphone. This permission is required by an audio dependency." }],
    ["expo-video", { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0A0E1A",
        dark: { backgroundColor: "#0A0E1A" },
      },
    ],
    ["expo-build-properties", { android: { buildArchs: ["armeabi-v7a", "arm64-v8a"], minSdkVersion: 24 } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "bf85e251-1d0a-4a51-b8d7-e990cd929072",
    },
  },
};

export default config;
