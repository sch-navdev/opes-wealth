/**
 * Coarse device classification from a session's stored `user_agent`, for the
 * Security page's session list. Heuristic by nature (UA strings are free
 * text): it only needs to answer "Computer, Mobile or App?" and name the
 * browser/OS well enough for the user to recognise their own device.
 */
export type DeviceType = "computer" | "mobile" | "app";

export type DeviceInfo = {
  type: DeviceType;
  /** e.g. "Chrome", "Safari"; `null` when the UA isn't recognisable. */
  browser: string | null;
  /** e.g. "Windows", "iOS"; `null` when the UA isn't recognisable. */
  os: string | null;
};

// Native/HTTP-client user agents (no browser engine string) — a session
// created by an installed app or a script rather than a web browser.
const APP_PATTERN = /(okhttp|cfnetwork|dalvik|expo|react-native|flutter|dart\/|opes[-\s]?(ios|android|app)|axios|node-fetch|curl\/|postman)/i;
const MOBILE_PATTERN = /(iphone|ipad|ipod|android|mobile|windows phone)/i;

function detectBrowser(ua: string): string | null {
  if (/edg(e|a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios|chromium/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return null;
}

function detectOs(ua: string): string | null {
  if (/windows phone/i.test(ua)) return "Windows Phone";
  if (/windows/i.test(ua)) return "Windows";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux|x11/i.test(ua)) return "Linux";
  return null;
}

export function parseDeviceInfo(userAgent: string | null | undefined): DeviceInfo {
  const ua = (userAgent ?? "").trim();
  if (!ua) return { type: "computer", browser: null, os: null };

  const browser = detectBrowser(ua);
  const os = detectOs(ua);

  // A native HTTP client has no browser token; a real browser UA always does,
  // so check "app" only when no browser was recognised.
  if (!browser && APP_PATTERN.test(ua)) return { type: "app", browser: null, os };
  if (MOBILE_PATTERN.test(ua)) return { type: "mobile", browser, os };
  return { type: "computer", browser, os };
}
