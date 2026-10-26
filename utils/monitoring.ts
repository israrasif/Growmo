// utils/monitoring.ts
// Crash and error reporting with Sentry. Every call is safe: if Sentry is not installed, has no key, or the app is
// running in development, nothing happens and the app carries on as usual.
//
// Privacy: no email, name or photos are sent, only an anonymous account id. Never put hair or health answers in `context`.
type Sentry = typeof import("@sentry/react-native");

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let lib: Sentry | null | undefined; // undefined = not tried yet, null = not available
let ready = false;

function load(): Sentry | null {
  if (lib !== undefined) return lib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib = require("@sentry/react-native") as Sentry;
  } catch {
    lib = null;
  }
  return lib;
}

/** Call once, at the top of the root layout file (outside any component). */
export function initMonitoring(): void {
  if (ready || __DEV__ || !DSN) return; // reporting is for real builds only
  const S = load();
  if (!S) return;
  try {
    S.init({
      dsn: DSN,
      sendDefaultPii: false,
      tracesSampleRate: 0, // errors only: keeps you well inside the free allowance
    });
    ready = true;
  } catch (e) {
    console.warn("[monitoring] could not start", e);
  }
}

/** Report a problem you caught yourself. `context` must only hold simple, non-personal facts. */
export function captureError(
  error: unknown,
  context?: Record<string, string | number | boolean>,
): void {
  if (!ready) return;
  try {
    load()?.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // never let reporting cause a problem
  }
}

/** Ties reports to the (anonymous) account id, or clears it on sign-out. */
export function setMonitoringUser(id: string | null): void {
  if (!ready) return;
  try {
    load()?.setUser(id ? { id } : null);
  } catch {
    // ignore
  }
}

/** Wraps the root layout so crashes are caught. Returns it unchanged when reporting is off. */
export function wrapRoot<T>(component: T): T {
  if (__DEV__ || !DSN) return component;
  const S = load();
  if (!S) return component;
  try {
    return S.wrap(component as never) as T;
  } catch {
    return component;
  }
}
