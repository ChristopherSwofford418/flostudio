// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols to Material Icons mappings for PocketLawyer.
 */
const MAPPING = {
  // Navigation tabs
  "house.fill": "home",
  "clock.fill": "history",
  "gearshape.fill": "settings",
  // PocketLawyer tabs
  "bubble.left.and.bubble.right.fill": "chat",
  "books.vertical.fill": "menu-book",
  "gear": "settings",
  "doc.badge.plus": "note-add",
  "lock.fill": "lock",
  "arrow.clockwise": "refresh",
  "plus": "add",
  "trash": "delete",
  // Home / Dashboard
  "shield.fill": "shield",
  "shield.lefthalf.filled": "security",
  "heart.text.square.fill": "favorite",
  "chart.bar.fill": "bar-chart",
  "wand.and.stars": "auto-fix-high",
  "sparkles": "auto-awesome",
  "bolt.fill": "bolt",
  "flame.fill": "local-fire-department",
  // Situation Wizard
  "map.fill": "map",
  "list.bullet.clipboard.fill": "assignment",
  "exclamationmark.circle.fill": "error",
  "checkmark.seal.fill": "verified",
  "flag.fill": "flag",
  "arrow.right.circle.fill": "arrow-circle-right",
  // Know Your Rights
  "book.closed.fill": "import-contacts",
  "hand.raised.fill": "back-hand",
  "bookmark.fill": "bookmark",
  "bookmark": "bookmark-border",
  "heart.fill": "favorite",
  "square.and.arrow.up": "share",
  // Documents
  "doc.fill": "description",
  "doc.text.fill": "article",
  "camera.fill": "camera-alt",
  "doc.on.clipboard.fill": "content-paste",
  "arrow.up.doc.fill": "upload-file",
  "folder.fill": "folder",
  "tray.full.fill": "inbox",
  // Results / Analysis
  "checkmark.shield.fill": "verified-user",
  "exclamationmark.triangle.fill": "warning",
  "xmark.circle.fill": "cancel",
  "checkmark.circle.fill": "check-circle",
  "chart.pie.fill": "pie-chart",
  // Attorney Finder
  "person.2.fill": "group",
  "location.fill": "location-on",
  "phone.fill": "phone",
  "envelope.fill": "email",
  "star.fill": "star",
  "star": "star-border",
  "building.2.fill": "business",
  // General UI
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "expand-more",
  "chevron.up": "expand-less",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "magnifyingglass": "search",
  "xmark": "close",
  "link": "link",
  "trash.fill": "delete",
  "crown.fill": "workspace-premium",
  "person.fill": "person",
  "person.crop.circle.fill": "account-circle",
  "info.circle.fill": "info",
  "questionmark.circle.fill": "help",
  "ellipsis.circle.fill": "more-horiz",
  "arrow.left": "arrow-back",
  "arrow.right": "arrow-forward",
  "arrow.up.right.square": "open-in-new",
  "mic.fill": "mic",
  "mic": "mic-none",
  "stop.fill": "stop",
  "play.fill": "play-arrow",
  "pause.fill": "pause",
  // Paywall / Subscription
  "infinity": "all-inclusive",
  "doc.text.magnifyingglass": "find-in-page",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
