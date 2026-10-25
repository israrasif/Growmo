// app/(drawer)/plans.tsx
// Free and Plus side by side. Free members can buy Plus here; Plus members can manage or restore it.
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { PurchasesPackage } from "react-native-purchases";
import TopBar from "@/components/TopBar";
import { colors, radii, spacing, typography } from "@/constants/theme";
import {
  MANAGE_URL,
  PRIVACY_URL,
  STORE_NAME,
  TERMS_URL,
} from "@/constants/links";
import { contentColumn } from "@/utils/responsive";
import { hasPlus, usePlanInfo } from "@/utils/entitlements";
import {
  getPlusPackages,
  getPurchasesIssue,
  purchasePlus,
  restorePlus,
  waitForPlusInDb,
  type PlusPackages,
} from "@/utils/purchases";

const FREE_PERKS = [
  "Massage timer and tracker",
  "Self-reported hair health score",
  "1 progress photo / month",
  "1 research article / month",
];

const PLUS_PERKS = [
  "A 12-week routine built around you, with guided sessions",
  "Three scalp areas in rotation, with step-by-step timing",
  "2 AI hair analyses a month, with trends",
  "Photo compare, up to 20 photos a month",
  "Weekly research digest and recap",
];

type Choice = "annual" | "monthly";
type Notice = { kind: "error" | "info"; title?: string; text: string } | null;

const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

export default function PlansScreen() {
  const info = usePlanInfo();
  const plus = hasPlus(info.plan);

  const [packages, setPackages] = useState<PlusPackages | null>(null); // null = still loading
  const [choice, setChoice] = useState<Choice>("annual");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const loadPackages = useCallback(async () => {
    setPackages(null);
    const p = await getPlusPackages();
    setPackages(p);
    setChoice(p.annual ? "annual" : "monthly");
  }, []);

  useEffect(() => {
    if (!plus) loadPackages();
  }, [plus, loadPackages]);

  const selected: PurchasesPackage | null =
    packages === null
      ? null
      : choice === "annual"
        ? packages.annual
        : packages.monthly;
  const noPlans = packages !== null && !packages.annual && !packages.monthly;
  const period =
    selected && packages && selected === packages.annual ? "year" : "month";

  const disclosure = selected
    ? `${selected.product.priceString} per ${period}. Renews automatically until you cancel. Cancel anytime in ${STORE_NAME}.`
    : `Renews automatically until you cancel. Cancel anytime in ${STORE_NAME}.`;

  const onBuy = async () => {
    if (busy) return;
    setNotice(null);
    if (!selected) {
      setNotice({
        kind: "error",
        text:
          "We could not load the plans right now. Check your connection and try again." +
          (__DEV__ && getPurchasesIssue()
            ? `\n\n[debug] ${getPurchasesIssue()}`
            : ""),
      });
      loadPackages();
      return;
    }
    setBusy("buy");
    const result = await purchasePlus(selected);
    setBusy(null);

    if (result.status === "success") {
      setNotice({
        kind: "info",
        title: "You're on Plus",
        text: result.synced
          ? "Everything is unlocked on your account."
          : "Your payment went through. Plus switches on in a moment.",
      });
      if (!result.synced) waitForPlusInDb(20000); // keeps checking, and the card updates by itself
    } else if (result.status === "pending") {
      setNotice({
        kind: "info",
        text: "Your payment is still being processed by the store. Plus switches on as soon as it completes.",
      });
    } else if (result.status === "error") {
      setNotice({
        kind: "error",
        title: "The payment did not go through",
        text: result.message,
      });
    } else {
      setNotice({
        kind: "info",
        text: "Purchase cancelled. You have not been charged.",
      });
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setNotice(null);
    setBusy("restore");
    const result = await restorePlus();
    setBusy(null);

    if (result.status === "restored") {
      setNotice({
        kind: "info",
        title: "Plus restored",
        text: "Welcome back.",
      });
    } else if (result.status === "none") {
      setNotice({
        kind: "info",
        text: "We could not find an active Plus subscription for this store account.",
      });
    } else {
      setNotice({ kind: "error", text: result.message });
    }
  };

  const renderOption = (
    key: Choice,
    label: string,
    pkg: PurchasesPackage | null,
  ) => {
    if (!pkg) return null;
    const on = choice === key;
    return (
      <Pressable
        key={key}
        onPress={() => setChoice(key)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={[styles.option, on && styles.optionOn]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.optionLabel}>{label}</Text>
          <Text style={styles.optionPrice}>{pkg.product.priceString}</Text>
        </View>
        <Ionicons
          name={on ? "radio-button-on" : "radio-button-off"}
          size={24}
          color={on ? colors.primary : colors.textMuted}
        />
      </Pressable>
    );
  };

  const periodEnd = info.expiresAt
    ? info.expiresAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Plans</Text>
        <Text style={styles.subtitle}>Pick what fits your routine.</Text>

        {/* Free */}
        <View style={[styles.card, !plus && styles.cardActive]}>
          <Text style={styles.name}>Free{!plus ? "  (current)" : ""}</Text>
          <Text style={styles.price}>$0</Text>
          {FREE_PERKS.map((p) => (
            <Text key={p} style={styles.perk}>
              • {p}
            </Text>
          ))}
        </View>

        {/* Plus */}
        <View style={[styles.card, plus && styles.cardActive]}>
          <Text style={styles.name}>Plus{plus ? "  (current)" : ""}</Text>
          {plus ? (
            !!periodEnd && (
              <Text style={styles.price}>Current period ends {periodEnd}</Text>
            )
          ) : (
            <Text style={styles.price}>
              {selected ? `${selected.product.priceString} per ${period}` : " "}
            </Text>
          )}
          {PLUS_PERKS.map((p) => (
            <Text key={p} style={styles.perk}>
              • {p}
            </Text>
          ))}

          {!plus && (
            <View style={styles.options}>
              {packages === null ? (
                <ActivityIndicator color={colors.primary} />
              ) : noPlans ? (
                <Pressable onPress={loadPackages} accessibilityRole="button">
                  <Text style={styles.link}>
                    Plans are unavailable right now. Tap to retry.
                  </Text>
                  {__DEV__ && !!getPurchasesIssue() && (
                    <Text style={styles.debug}>
                      [debug] {getPurchasesIssue()}
                    </Text>
                  )}
                </Pressable>
              ) : (
                <>
                  {renderOption("annual", "Yearly", packages.annual)}
                  {renderOption("monthly", "Monthly", packages.monthly)}
                </>
              )}
            </View>
          )}
        </View>

        {notice && (
          <View
            style={[
              styles.notice,
              notice.kind === "error" ? styles.noticeError : styles.noticeInfo,
            ]}
          >
            <Ionicons
              name={
                notice.kind === "error" ? "alert-circle" : "information-circle"
              }
              size={20}
              color={notice.kind === "error" ? colors.danger : colors.primary}
            />
            <View style={{ flex: 1 }}>
              {!!notice.title && (
                <Text style={styles.noticeTitle}>{notice.title}</Text>
              )}
              <Text style={styles.noticeText}>{notice.text}</Text>
            </View>
          </View>
        )}

        {plus ? (
          <Pressable
            style={styles.primary}
            onPress={() => openUrl(MANAGE_URL)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Manage subscription</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={[styles.primary, busy !== null && { opacity: 0.7 }]}
              onPress={onBuy}
              disabled={busy !== null}
              accessibilityRole="button"
            >
              {busy === "buy" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Get Plus</Text>
              )}
            </Pressable>
            <Text style={styles.fine}>{disclosure}</Text>
          </>
        )}

        <View style={styles.legalRow}>
          {!!TERMS_URL && (
            <Pressable
              onPress={() => openUrl(TERMS_URL)}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.fineLink}>Terms</Text>
            </Pressable>
          )}
          {!!PRIVACY_URL && (
            <Pressable
              onPress={() => openUrl(PRIVACY_URL)}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.fineLink}>Privacy Policy</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onRestore}
            disabled={busy !== null}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.fineLink}>
              {busy === "restore" ? "Restoring…" : "Restore purchases"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.sm + 4,
    ...contentColumn,
  },
  title: { ...typography.h1, color: colors.text },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardActive: { borderColor: colors.primary },
  name: { ...typography.h3, color: colors.text },
  price: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  perk: { ...typography.body, color: colors.text, lineHeight: 20 },
  options: { marginTop: spacing.sm, gap: spacing.sm + 2, minHeight: 40 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.track },
  optionLabel: { ...typography.h3, color: colors.text },
  optionPrice: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  link: { ...typography.body, color: colors.primary, fontWeight: "600" },
  debug: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  notice: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radii.md,
  },
  noticeError: {
    backgroundColor: colors.track,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  noticeInfo: { backgroundColor: colors.track },
  noticeTitle: { ...typography.body, color: colors.text, fontWeight: "700" },
  noticeText: {
    ...typography.body,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  primary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
  },
  primaryText: { ...typography.h3, color: "#fff" },
  fine: {
    ...typography.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  legalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.md,
  },
  fineLink: {
    ...typography.body,
    fontSize: 13,
    color: colors.textMuted,
    textDecorationLine: "underline",
  },
});
