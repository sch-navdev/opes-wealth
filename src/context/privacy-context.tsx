"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

const STORAGE_KEY = "opes_privacy_mode";
const MASK = "••••••••";

type PrivacyContextValue = {
  isPrivate: boolean;
  togglePrivacy: () => void;
  maskValue: (value: string | number) => string;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** The server (and the client's very first paint) always renders "not private" — the real value, if different, is only knowable after mount, once `localStorage` exists. */
function getServerSnapshot(): boolean {
  return false;
}

function writeIsPrivate(next: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // ignore write failures
  }
  listeners.forEach((listener) => listener());
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const isPrivate = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const togglePrivacy = useCallback(() => {
    writeIsPrivate(!getSnapshot());
  }, []);

  const maskValue = useCallback(
    (value: string | number) => (isPrivate ? MASK : String(value)),
    [isPrivate],
  );

  return (
    <PrivacyContext.Provider value={{ isPrivate, togglePrivacy, maskValue }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error("usePrivacy must be used within a PrivacyProvider");
  }
  return context;
}
