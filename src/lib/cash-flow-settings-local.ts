import { DEFAULT_SETTINGS, normalizeSettings, type CashFlowSettings } from "@/lib/cash-flow-waterfall";

/**
 * Browser storage of the cash-flow waterfall settings (same fallback pattern as the dashboard layout:
 * every access is wrapped in try/catch because localStorage can be missing, full or blocked). Never sent
 * to the server.
 */
export const CASH_FLOW_SETTINGS_KEY = "opes-cash-flow-settings-v1";

const listeners = new Set<() => void>();
/** In-tab copy, so a blocked localStorage still lets the panel work for this visit. */
let memory: string | null | undefined;

export function readSettingsRaw(): string | null {
  if (memory !== undefined) return memory;
  try {
    return localStorage.getItem(CASH_FLOW_SETTINGS_KEY);
  } catch {
    return null;
  }
}

export function parseSettings(raw: string | null): CashFlowSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Returns whether the write succeeded (listeners are notified either way so this tab still updates). */
export function writeSettings(settings: CashFlowSettings): boolean {
  let ok = true;
  memory = JSON.stringify(settings);
  try {
    localStorage.setItem(CASH_FLOW_SETTINGS_KEY, memory);
  } catch {
    ok = false;
  }
  listeners.forEach((l) => l());
  return ok;
}

export function clearSettings() {
  memory = undefined;
  try {
    localStorage.removeItem(CASH_FLOW_SETTINGS_KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CASH_FLOW_SETTINGS_KEY) {
      memory = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
