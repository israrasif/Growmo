// utils/purchases.ts
// RevenueCat wrapper: setup, offerings, buying and restoring.
// Source of truth for what a user may do is still the Supabase `user_plans` table (see utils/entitlements.ts).
// RevenueCat -> webhook (supabase/functions/revenuecat-webhook) -> user_plans. This file just starts purchases
// and then waits for that table to catch up.
//
// The RevenueCat library is loaded lazily and every call is guarded. If its native part is missing (Expo Go, or a
// development build made before the library was added) the app keeps working and purchases show as unavailable.
import { Platform } from "react-native";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { supabase } from "@/utils/supabase";
import { refreshPlan } from "@/utils/entitlements";

/** Must match the entitlement identifier you create in the RevenueCat dashboard. */
export const PLUS_ENTITLEMENT = "plus";

const API_KEY = Platform.select({
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
});

type RevenueCat = typeof import("react-native-purchases");

let lib: RevenueCat | null | undefined; // undefined = not tried yet, null = not available
let configured = false;
let broken = false;
let issue: string | null = null; // the last reason purchases are unavailable (shown in development builds)

/** Why plans could not be loaded, in plain words. null when everything is fine. */
export function getPurchasesIssue(): string | null {
  return issue;
}

function loadLib(): RevenueCat | null {
  if (lib !== undefined) return lib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib = require("react-native-purchases") as RevenueCat;
  } catch (e) {
    console.warn("[purchases] RevenueCat could not be loaded.", e);
    lib = null;
  }
  return lib;
}

/** Safe to call many times. Returns false when purchases are unavailable (no key, or no native module). */
export function initPurchases(): boolean {
  if (configured) return true;
  if (broken) return false;
  if (!API_KEY) {
    issue =
      "No RevenueCat API key found. Check EXPO_PUBLIC_REVENUECAT_ANDROID_KEY in .env, then restart Metro with: npx expo start -c";
    console.warn("[purchases]", issue);
    return false;
  }
  const mod = loadLib();
  if (!mod) {
    issue =
      "The RevenueCat library could not be loaded. Is react-native-purchases installed?";
    broken = true;
    return false;
  }
  try {
    const Purchases = mod.default;
    // if (__DEV__) Purchases.setLogLevel(mod.LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: API_KEY });
    Purchases.addCustomerInfoUpdateListener(() => {
      // The webhook needs a moment to update the database; re-check shortly after RevenueCat reports a change.
      setTimeout(() => {
        refreshPlan();
      }, 2000);
    });
    configured = true;
    return true;
  } catch (e) {
    // Most likely the native module is missing: this build was made without react-native-purchases.
    issue = `RevenueCat setup failed: ${(e as Error)?.message ?? String(e)}`;
    console.warn("[purchases]", issue);
    broken = true;
    return false;
  }
}

/** The RevenueCat object, or null when purchases are unavailable. */
function purchases() {
  return initPurchases() ? (loadLib() as RevenueCat).default : null;
}

/** Ties purchases to the Supabase user id (so the webhook knows whose plan to update). Pass null on sign-out. */
export async function identifyPurchaser(userId: string | null): Promise<void> {
  const P = purchases();
  if (!P) return;
  try {
    if (userId) {
      await P.logIn(userId);
    } else if (!(await P.isAnonymous())) {
      await P.logOut();
    }
  } catch (e) {
    console.warn("[purchases] identify failed", e);
  }
}

export type PlusPackages = {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
};

/** The packages in the current offering (set it in the RevenueCat dashboard). */
export async function getPlusPackages(): Promise<PlusPackages> {
  const none = { monthly: null, annual: null };
  const P = purchases();
  if (!P) return none; // the reason is in getPurchasesIssue()
  try {
    const offerings = await P.getOfferings();
    const current = offerings.current;
    if (!current) {
      issue =
        "RevenueCat has no current offering. In the dashboard, open Offerings and make one of them Current.";
      return none;
    }
    // Normally the Monthly and Annual packages; fall back to matching names if custom packages were used.
    const all = current.availablePackages ?? [];
    const find = (...words: string[]) =>
      all.find((p) =>
        words.some(
          (w) =>
            p.identifier.toLowerCase().includes(w) ||
            p.product.identifier.toLowerCase().includes(w),
        ),
      ) ?? null;
    const monthly = current.monthly ?? find("month");
    const annual = current.annual ?? find("annual", "year");
    if (!monthly && !annual) {
      issue =
        "The current offering has no Monthly or Annual package. Add them to the offering in the dashboard.";
      return none;
    }
    issue = null;
    return { monthly, annual };
  } catch (e) {
    issue = `RevenueCat could not load the plans: ${(e as Error)?.message ?? String(e)}`;
    console.warn("[purchases]", issue);
    return none;
  }
}

function hasPlus(info: CustomerInfo): boolean {
  return !!info.entitlements.active[PLUS_ENTITLEMENT];
}

async function planIsPlusInDb(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("user_plans")
      .select("plan, expires_at")
      .maybeSingle();
    if (!data || data.plan !== "plus") return false;
    return !data.expires_at || new Date(data.expires_at).getTime() > Date.now();
  } catch {
    return false;
  }
}

/** Polls until the webhook has written the plan (usually a few seconds). */
export async function waitForPlusInDb(maxMs = 12000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await planIsPlusInDb()) {
      await refreshPlan();
      return true;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  await refreshPlan();
  return false;
}

export type PurchaseResult =
  | { status: "success"; synced: boolean }
  | { status: "cancelled" }
  | { status: "pending" } // the store is still processing the payment
  | { status: "error"; message: string };

type RcError = {
  code?: string | number;
  message?: string;
  underlyingErrorMessage?: string;
  userCancelled?: boolean | null;
};

/** Turns a RevenueCat error into a result with a message a person can act on. */
function purchaseErrorResult(e: unknown): PurchaseResult {
  const err = (e ?? {}) as RcError;
  const codes = (loadLib()?.PURCHASES_ERROR_CODE ?? {}) as Record<
    string,
    string | number
  >;
  const is = (name: string) =>
    codes[name] !== undefined && err.code === codes[name];

  if (err.userCancelled || is("PURCHASE_CANCELLED_ERROR"))
    return { status: "cancelled" };
  if (is("PAYMENT_PENDING_ERROR")) return { status: "pending" };

  let message =
    "Something went wrong with the purchase. You have not been charged unless the store says so.";
  if (is("PRODUCT_ALREADY_PURCHASED_ERROR")) {
    message =
      "This store account already has Plus. Tap Restore purchases to switch it on.";
  } else if (is("NETWORK_ERROR")) {
    message =
      "We could not reach the store. Check your connection and try again.";
  } else if (
    is("PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR") ||
    is("CONFIGURATION_ERROR")
  ) {
    message =
      "This plan is not available from the store right now. Please try again later.";
  } else if (is("PURCHASE_NOT_ALLOWED_ERROR")) {
    message = "Purchases are not allowed on this device or account.";
  } else if (is("STORE_PROBLEM_ERROR")) {
    message = "The store had a problem. Please try again in a moment.";
  }

  // While developing, show what the store actually said so a failed test purchase can be diagnosed.
  if (__DEV__) {
    message +=
      `\n\n[debug] code: ${String(err.code)}\n${err.message ?? ""}\n${err.underlyingErrorMessage ?? ""}`.trimEnd();
  }
  return { status: "error", message };
}

export async function purchasePlus(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  const P = purchases();
  if (!P) {
    return {
      status: "error",
      message:
        "Purchases are not available in this version of the app. Please update the app and try again.",
    };
  }
  try {
    const { customerInfo } = await P.purchasePackage(pkg);
    if (!hasPlus(customerInfo)) {
      return {
        status: "error",
        message:
          "The purchase went through but Plus is not active yet. Try Restore purchases.",
      };
    }
    const synced = await waitForPlusInDb();
    return { status: "success", synced };
  } catch (e) {
    console.warn("[purchases] purchase failed", JSON.stringify(e), e);
    return purchaseErrorResult(e);
  }
}

export type RestoreResult =
  | { status: "restored"; synced: boolean }
  | { status: "none" }
  | { status: "error"; message: string };

export async function restorePlus(): Promise<RestoreResult> {
  const P = purchases();
  if (!P)
    return {
      status: "error",
      message: "Purchases are not available in this version of the app.",
    };
  try {
    const info = await P.restorePurchases();
    if (!hasPlus(info)) return { status: "none" };
    const synced = await waitForPlusInDb();
    return { status: "restored", synced };
  } catch (e) {
    console.warn("[purchases] restore failed", e);
    return {
      status: "error",
      message:
        "Could not restore purchases. Check your connection and try again.",
    };
  }
}
