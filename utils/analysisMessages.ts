// utils/analysisMessages.ts
// Plain, kind wording for when the AI hair check does not give a result.
// The server sends its reason as text; this turns it into a title, an explanation and whether trying again can help.

export type Failure = {
  kind: "limit" | "attempts" | "busy" | "connection" | "plan" | "other";
  title: string;
  body: string;
  /** false when trying the same thing again right now would not help */
  canRetry: boolean;
};

export function describeFailure(message: string | null | undefined): Failure {
  const m = (message ?? "").toLowerCase();

  if (m.includes("hair checks for this month")) {
    // The server's sentence already says when the next check is available
    return {
      kind: "limit",
      title: "You've used this month's hair checks",
      body: message as string,
      canRetry: false,
    };
  }
  if (m.includes("sent a lot of photos")) {
    return {
      kind: "attempts",
      title: "That's enough photos for today",
      body: "Please try again tomorrow. Nothing was taken from your monthly checks.",
      canRetry: false,
    };
  }
  if (m.includes("busy")) {
    return {
      kind: "busy",
      title: "We're a bit busy",
      body: "Give it a minute and try again. This didn't use one of your checks.",
      canRetry: true,
    };
  }
  if (m.includes("plus feature")) {
    return {
      kind: "plan",
      title: "Plus is still switching on",
      body: "Give it a moment and try again. Your payment is safe.",
      canRetry: true,
    };
  }
  if (
    m.includes("network") ||
    m.includes("connection") ||
    m.includes("fetch") ||
    m.includes("internet")
  ) {
    return {
      kind: "connection",
      title: "No connection",
      body: "Check your internet and try again. Nothing was used from your monthly checks.",
      canRetry: true,
    };
  }
  return {
    kind: "other",
    title: "The analysis didn't finish",
    body: "That was a problem on our side, not with your photo, and it didn't use one of your checks. Please try again.",
    canRetry: true,
  };
}

/** Shown when a photo could not be read. Same advice every time, so it is easy to follow. */
export const PHOTO_CHECKLIST = [
  "Face a window or bright light, and turn the flash off.",
  "Hold the phone steady and fill the guide on the screen.",
  "Part your hair the way you normally wear it, and keep it dry.",
  "Use the same spot and angle each time, so photos compare well.",
];
