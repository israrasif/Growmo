// utils/purchases.ts
// RevenueCat wrapper: setup, offerings, buying and restoring.
// Source of truth for what a user may do is still the Supabase `user_plans` table (see utils/entitlements.ts).
// RevenueCat -> webhook (supabase/functions/revenuecat-webhook) -> user_plans. This file just starts purchases
// and then waits for that table to catch up.
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import { supabase } from '@/utils/supabase';
import { refreshPlan } from '@/utils/entitlements';

/** Must match the entitlement identifier you create in the RevenueCat dashboard. */
export const PLUS_ENTITLEMENT = 'plus';

const API_KEY = Platform.select({
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
});

let configured = false;

/** Safe to call many times. Returns false when no API key is set (purchases are then unavailable). */
export function initPurchases(): boolean {
  if (configured) return true;
  if (!API_KEY) {
    console.warn('[purchases] No RevenueCat API key set. Purchases are disabled.');
    return false;
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: API_KEY });
  Purchases.addCustomerInfoUpdateListener(() => {
    // The webhook needs a moment to update the database; re-check shortly after RevenueCat reports a change.
    setTimeout(() => {
      refreshPlan();
    }, 2000);
  });
  configured = true;
  return true;
}

/** Ties purchases to the Supabase user id (so the webhook knows whose plan to update). Pass null on sign-out. */
export async function identifyPurchaser(userId: string | null): Promise<void> {
  if (!initPurchases()) return;
  try {
    if (userId) {
      await Purchases.logIn(userId);
    } else if (!(await Purchases.isAnonymous())) {
      await Purchases.logOut();
    }
  } catch (e) {
    console.warn('[purchases] identify failed', e);
  }
}

export type PlusPackages = {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
};

/** The packages in the current offering (set it in the RevenueCat dashboard). */
export async function getPlusPackages(): Promise<PlusPackages> {
  const none = { monthly: null, annual: null };
  if (!initPurchases()) return none;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return none;
    return { monthly: current.monthly ?? null, annual: current.annual ?? null };
  } catch (e) {
    console.warn('[purchases] getOfferings failed', e);
    return none;
  }
}

function hasPlus(info: CustomerInfo): boolean {
  return !!info.entitlements.active[PLUS_ENTITLEMENT];
}

async function planIsPlusInDb(): Promise<boolean> {
  try {
    const { data } = await supabase.from('user_plans').select('plan, expires_at').maybeSingle();
    if (!data || data.plan !== 'plus') return false;
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
  | { status: 'success'; synced: boolean }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export async function purchasePlus(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (!hasPlus(customerInfo)) {
      return { status: 'error', message: 'The purchase went through but Plus is not active yet. Try Restore purchases.' };
    }
    const synced = await waitForPlusInDb();
    return { status: 'success', synced };
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return { status: 'cancelled' };
    console.warn('[purchases] purchase failed', e);
    return { status: 'error', message: 'Something went wrong with the purchase. You have not been charged unless the store says so.' };
  }
}

export type RestoreResult =
  | { status: 'restored'; synced: boolean }
  | { status: 'none' }
  | { status: 'error'; message: string };

export async function restorePlus(): Promise<RestoreResult> {
  if (!initPurchases()) return { status: 'error', message: 'Purchases are not available right now.' };
  try {
    const info = await Purchases.restorePurchases();
    if (!hasPlus(info)) return { status: 'none' };
    const synced = await waitForPlusInDb();
    return { status: 'restored', synced };
  } catch (e) {
    console.warn('[purchases] restore failed', e);
    return { status: 'error', message: 'Could not restore purchases. Check your connection and try again.' };
  }
}