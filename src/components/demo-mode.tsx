"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/context/language-context";

type DemoModeValue = { isDemo: boolean; notifySaved: () => void };
const DemoModeContext = createContext<DemoModeValue>({ isDemo: false, notifySaved: () => {} });

export const useDemoMode = () => useContext(DemoModeContext);

/**
 * Demo account UX. The demo login is read-only (see lib/demo-mode.ts): the server
 * swallows its writes and reports them as saved. This shows the matching green
 * "Saved (Demo Mode)" toast after every server action the demo user triggers, and lets
 * the few screens that change the login itself (two-factor, passkeys) skip the action.
 */
export function DemoModeProvider({ isDemo, children }: { isDemo: boolean; children: React.ReactNode }) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifySaved = useCallback(() => {
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 3000);
  }, []);

  // Server actions are POSTs carrying a `Next-Action` header; toast when one succeeds.
  useEffect(() => {
    if (!isDemo) return;
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      try {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (headers.has("next-action") && response.ok) notifySaved();
      } catch {
        // never let the toast break a request
      }
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, [isDemo, notifySaved]);

  const value = useMemo(() => ({ isDemo, notifySaved }), [isDemo, notifySaved]);

  return (
    <DemoModeContext.Provider value={value}>
      {children}
      {isDemo && visible && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-md bg-success px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          <CheckCircle2 className="size-5" aria-hidden="true" />
          {t("demo_saved")}
        </div>
      )}
    </DemoModeContext.Provider>
  );
}
