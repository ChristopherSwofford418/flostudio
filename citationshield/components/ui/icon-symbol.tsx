// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols to Material Icons mappings for Citation Shield.
 */
const MAPPING = {
  // Navigation tabs
  "house.fill": "home",
  "clock.fill": "history",
  "gearshape.fill": "settings",
  // Upload screen
  "doc.fill": "description",
  "doc.text.fill": "article",
  "camera.fill": "camera-alt",
  "doc.on.clipboard.fill": "content-paste",
  "arrow.up.doc.fill": "upload-file",
  // Results screen
  "checkmark.shield.fill": "verified-user",
  "exclamationmark.triangle.fill": "warning",
  "xmark.circle.fill": "cancel",
  "checkmark.circle.fill": "check-circle",
  // General UI
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "magnifyingglass": "search",
  "xmark": "close",
  "square.and.arrow.up": "share",
  "star.fill": "star",
  "crown.fill": "workspace-premium",
  "person.fill": "person",
  "info.circle.fill": "info",
  "link": "link",
  "trash.fill": "delete",
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
