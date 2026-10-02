"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

/**
 * A string kept in localStorage and shared between components in the same tab (and
 * other tabs through the `storage` event). Server render and first client render both
 * see "", so there is no hydration mismatch. Never sent to the server.
 */
export function useStored(key: string): [string, (next: string) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  return [
    value,
    (next) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // storage unavailable: the value just isn't remembered
      }
      listeners.forEach((l) => l());
    },
  ];
}
