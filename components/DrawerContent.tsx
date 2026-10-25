import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter, type Href } from "expo-router";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { hasPlus, usePlan } from "@/utils/entitlements";

type Item = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  tag?: "Plus";
};

const MAIN_ITEMS: Item[] = [
  { label: "Home", icon: "home-outline", href: "/" },
  { label: "Research", icon: "book-outline", href: "/research" },
  {
    label: "Routine builder",
    icon: "list-outline",
    href: "/routine",
    tag: "Plus",
  },
  { label: "Tips", icon: "bulb-outline", href: "/tips" },
];

// Home owns the whole bottom tab bar, so it counts as active on any of these.
const TAB_PATHS = ["/", "/tracker", "/vault", "/analyze"];

const FOOTER_ITEMS: Item[] = [
  { label: "Plans", icon: "ribbon-outline", href: "/plans" },
  { label: "Settings", icon: "settings-outline", href: "/settings" },
  { label: "Help", icon: "help-circle-outline", href: "/help" },
];

// Only what we use. The drawer passes more props, which is fine.
type Props = { navigation: { closeDrawer: () => void } };

export default function DrawerContent(props: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const plan = usePlan();

  const isLocked = (tag?: Item["tag"]) => tag === "Plus" && !hasPlus(plan);

  const go = (item: Item) => {
    props.navigation.closeDrawer();
    // Locked items open the plans screen instead of an empty feature.
    router.navigate(isLocked(item.tag) ? "/plans" : item.href);
  };

  const renderItem = (item: Item) => {
    const active =
      item.href === "/" ? TAB_PATHS.includes(pathname) : pathname === item.href;
    const locked = isLocked(item.tag);
    return (
      <Pressable
        key={item.label}
        onPress={() => go(item)}
        style={[styles.item, active && styles.itemActive]}
        accessibilityRole="button"
      >
        <Ionicons
          name={item.icon}
          size={22}
          color={active ? colors.primary : colors.text}
        />
        <Text style={[styles.itemLabel, active && { color: colors.primary }]}>
          {item.label}
        </Text>
        {item.tag && locked ? (
          <View style={styles.tag}>
            <Ionicons name="lock-closed" size={11} color={colors.primaryDark} />
            <Text style={styles.tagText}>{item.tag}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + spacing.sm },
      ]}
    >
      {!hasPlus(plan) && (
        <Pressable
          onPress={() =>
            go({ label: "Plans", icon: "ribbon-outline", href: "/plans" })
          }
          style={styles.upgrade}
          accessibilityRole="button"
        >
          <Text style={styles.upgradeTitle}>Unlock Plus</Text>
          <Text style={styles.upgradeBody}>
            A personalized routine, AI hair checks and photo compare.
          </Text>
          <View style={styles.upgradeButton}>
            <Text style={styles.upgradeButtonText}>See plans</Text>
          </View>
        </Pressable>
      )}

      <View style={styles.section}>{MAIN_ITEMS.map(renderItem)}</View>
      <View style={styles.divider} />
      <View style={styles.section}>{FOOTER_ITEMS.map(renderItem)}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  upgrade: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  upgradeTitle: { ...typography.h3, color: "#fff" },
  upgradeBody: {
    ...typography.caption,
    color: "#F3E6F0",
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  upgradeButton: {
    alignSelf: "flex-start",
    marginTop: spacing.sm + 4,
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
  },
  upgradeButtonText: { color: colors.primary, fontWeight: "700" },
  section: { gap: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm + 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radii.sm + 4,
  },
  itemActive: { backgroundColor: colors.track },
  itemLabel: { ...typography.body, flex: 1, fontSize: 16, color: colors.text },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: { color: colors.primaryDark, fontSize: 11, fontWeight: "700" },
});
