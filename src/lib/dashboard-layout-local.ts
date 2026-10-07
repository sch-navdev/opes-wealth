import { normalizeLayouts, type DashboardLayouts } from "@/lib/dashboard-layout";

/**
 * Browser fallback for the dashboard layout, used while the account copy cannot be saved
 * (migration 0035 not applied, offline, demo account...). Every access is wrapped in try/catch:
 * localStorage can be missing, full or blocked (private windows, cleared site data).
 */
export const LOCAL_LAYOUT_KEY = "opes-dashboard-layout-v1";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** Raw stored string (stable between calls, so it can be a useSyncExternalStore snapshot). */
export function readLocalLayoutRaw(): string | null {
  try {
    return localStorage.getItem(LOCAL_LAYOUT_KEY);
  } catch {
    return null;
  }
}

/** Validated layouts from a raw string; anything unusable -> null. */
export function parseLocalLayouts(raw: string | null): DashboardLayouts | null {
  if (!raw) return null;
  try {
    return normalizeLayouts(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Returns whether the write succeeded. */
export function writeLocalLayouts(layouts: DashboardLayouts): boolean {
  try {
    localStorage.setItem(LOCAL_LAYOUT_KEY, JSON.stringify(layouts));
    notify();
    return true;
  } catch {
    return false;
  }
}

export function clearLocalLayouts() {
  try {
    localStorage.removeItem(LOCAL_LAYOUT_KEY);
  } catch {
    // ignore
  }
  notify();
}

export function subscribeLocalLayouts(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === LOCAL_LAYOUT_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
