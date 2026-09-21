"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "opes_privacy_mode";
const MASK = "••••••••";

type PrivacyContextValue = {
  isPrivate: boolean;
  togglePrivacy: () => void;
  maskValue: (value: string | number) => string;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    try {
      setIsPrivate(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // localStorage unavailable (private browsing, etc.) — stay visible.
    }
  }, []);

  const togglePrivacy = useCallback(() => {
    setIsPrivate((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore write failures
      }
      return next;
    });
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
