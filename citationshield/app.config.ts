// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const env = {
  appName: "Citation Shield",
  appSlug: "citation-shield",
  owner: "cswofford",
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663747676936/RRyRR2r653oYHaMMETFRjb/citation-shield-icon-MMsV4qceNhZv3R45Laefye.png",
  scheme: "citationshield",
  iosBundleId: "com.citationshield.app",
  androidPackage: "com.citationshield.app",
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  owner: env.owner,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      // Encryption: app uses standard HTTPS/TLS only, no custom encryption
      ITSAppUsesNonExemptEncryption: false,
      // Required privacy usage descriptions — Apple rejects without these
      NSPhotoLibraryUsageDescription:
        "Citation Shield needs access to your photo library to let you select document images for citation scanning.",
      NSCameraUsageDescription:
        "Citation Shield needs camera access to photograph and scan printed legal documents.",
      NSMicrophoneUsageDescription:
        "Citation Shield does not use the microphone. This permission is included by a dependency.",
      // Document picker — required for PDF/DOCX access
      UIFileSharingEnabled: true,
      LSSupportsOpeningDocumentsInPlace: false,
      // Required for document type support
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
    permissions: [
      "POST_NOTIFICATIONS",
      "READ_EXTERNAL_STORAGE",
      "READ_MEDIA_IMAGES",
    ],
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
    [
      "expo-document-picker",
      {
        iCloudContainerEnvironment: "Production",
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission:
          "Citation Shield does not use the microphone. This permission is required by an audio dependency.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: false,
        supportsPictureInPicture: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#F7F8FA",
        dark: {
          backgroundColor: "#0F1117",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "e273e4e7-f343-4c73-b065-bb39f3be1b48",
    },
  },
};

export default config;
