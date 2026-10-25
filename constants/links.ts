// constants/links.ts
// Web addresses and store names used on the purchase screens (pitch screen and Plans screen).
import { Platform } from "react-native";

// TODO: put your real web addresses here. Google Play and the App Store both expect Terms and Privacy Policy links
// on the purchase screen. A link left empty is simply not shown.
export const TERMS_URL = "";
export const PRIVACY_URL = "";

export const STORE_NAME =
  Platform.OS === "ios" ? "the App Store" : "Google Play";
export const MANAGE_URL =
  Platform.OS === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : "https://play.google.com/store/account/subscriptions";
