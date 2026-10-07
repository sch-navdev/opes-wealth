"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { saveDashboardLayout } from "@/app/dashboard/layout-actions";
import { useUiTier } from "@/components/tier-gate";
import {
  defaultLayout,
  layoutForTier,
  layoutsEqual,
  moveBlock,
  moveBlockBy,
  normalizeLayout,
  normalizeLayouts,
  resizeBlock,
  toggleBlock,
  withTierLayout,
  type BlockId,
  type BlockSize,
  type DashboardLayout,
  type DashboardLayouts,
} from "@/lib/dashboard-layout";
import {
  clearLocalLayouts,
  parseLocalLayouts,
  readLocalLayoutRaw,
  subscribeLocalLayouts,
  writeLocalLayouts,
} from "@/lib/dashboard-layout-local";
import type { ExpertiseLevel } from "@/stores/useUiTierStore";

export type LayoutSaveStatus = "idle" | "saving" | "saved" | "local" | "failed";

export type DashboardLayoutContextValue = {
  tier: ExpertiseLevel;
  editing: boolean;
  /** The layout being edited (draft) in edit mode, else the saved one, for the active tier. */
  layout: DashboardLayout;
  status: LayoutSaveStatus;
  startEditing: () => void;
  /** Validates, saves (optimistic; account first, localStorage fallback) and leaves edit mode. */
  done: () => Promise<void>;
  /** Leaves edit mode and discards the draft. */
  cancel: () => void;
  /** Replaces the draft with the default layout (still needs Done to persist). */
  reset: () => void;
  toggle: (id: BlockId) => void;
  move: (id: BlockId, toIndex: number) => void;
  moveBy: (id: BlockId, delta: number) => void;
  resize: (id: BlockId, size: BlockSize) => void;
};

const DashboardLayoutContext = createContext<DashboardLayoutContextValue | null>(null);

const STATUS_CLEAR_MS = 5000;
const getServerLocal = () => null;

/**
 * Holds the dashboard layout for the whole page (header "Customize" button + the block grid), so
 * both talk to one state. `initialLayouts` is what the server loaded from the account, so the
 * first render already has the user's layout (no flash). A layout kept in localStorage (written
 * only when the account copy could not be saved) wins over it until a later save succeeds.
 */
export function DashboardLayoutProvider({
  initialLayouts,
  children,
}: {
  initialLayouts: DashboardLayouts | null;
  children: ReactNode;
}) {
  const tier = useUiTier();
  const [committed, setCommitted] = useState<DashboardLayouts | null>(() =>
    initialLayouts ? normalizeLayouts(initialLayouts) : null,
  );
  const [edit, setEdit] = useState<{ tier: ExpertiseLevel; draft: DashboardLayout; snapshot: DashboardLayout } | null>(null);
  const [status, setStatus] = useState<LayoutSaveStatus>("idle");

  // Server snapshot is null, so hydration matches the server render; after mount the stored value applies.
  const localRaw = useSyncExternalStore(subscribeLocalLayouts, readLocalLayoutRaw, getServerLocal);
  const local = useMemo(() => parseLocalLayouts(localRaw), [localRaw]);
  const effective = local ?? committed;

  const editing = edit !== null && edit.tier === tier;
  const saved = useMemo(() => layoutForTier(effective, tier), [effective, tier]);
  const layout = editing ? edit.draft : saved;

  const startEditing = useCallback(() => {
    setEdit({ tier, draft: saved, snapshot: saved });
  }, [tier, saved]);

  const cancel = useCallback(() => setEdit(null), []);

  const patchDraft = useCallback(
    (fn: (draft: DashboardLayout) => DashboardLayout) =>
      setEdit((cur) => (cur ? { ...cur, draft: fn(cur.draft) } : cur)),
    [],
  );

  const reset = useCallback(() => setEdit((cur) => (cur ? { ...cur, draft: defaultLayout(cur.tier) } : cur)), []);
  const toggle = useCallback((id: BlockId) => patchDraft((d) => toggleBlock(d, id)), [patchDraft]);
  const move = useCallback((id: BlockId, toIndex: number) => patchDraft((d) => moveBlock(d, id, toIndex)), [patchDraft]);
  const moveBy = useCallback((id: BlockId, delta: number) => patchDraft((d) => moveBlockBy(d, id, delta)), [patchDraft]);
  const resize = useCallback((id: BlockId, size: BlockSize) => patchDraft((d) => resizeBlock(d, id, size)), [patchDraft]);

  const done = useCallback(async () => {
    if (!edit || edit.tier !== tier) {
      setEdit(null);
      return;
    }
    const clean = normalizeLayout(edit.draft, tier);
    setEdit(null);
    if (layoutsEqual(clean, edit.snapshot)) return; // nothing changed: nothing to save

    const next = withTierLayout(effective, tier, clean);
    setCommitted(next);
    setStatus("saving");
    // Keep a local copy while the request is in flight (shows immediately, survives a closed tab);
    // it is removed again once the account copy is saved.
    const localOk = writeLocalLayouts(next);

    let accountOk = false;
    try {
      const result = await saveDashboardLayout(next);
      accountOk = result.ok;
      if (result.ok) setCommitted(result.layouts);
    } catch {
      accountOk = false;
    }

    if (accountOk) {
      clearLocalLayouts();
      setStatus("saved");
    } else {
      setStatus(localOk ? "local" : "failed");
    }
    setTimeout(() => setStatus((s) => (s === "saving" ? s : "idle")), STATUS_CLEAR_MS);
  }, [edit, tier, effective]);

  const value = useMemo<DashboardLayoutContextValue>(
    () => ({ tier, editing, layout, status, startEditing, done, cancel, reset, toggle, move, moveBy, resize }),
    [tier, editing, layout, status, startEditing, done, cancel, reset, toggle, move, moveBy, resize],
  );

  return <DashboardLayoutContext.Provider value={value}>{children}</DashboardLayoutContext.Provider>;
}

/** The layout editor; throws outside a provider (use `useOptionalDashboardLayout` where that is fine). */
export function useDashboardLayout(): DashboardLayoutContextValue {
  const ctx = useContext(DashboardLayoutContext);
  if (!ctx) throw new Error("useDashboardLayout must be used within a DashboardLayoutProvider");
  return ctx;
}

export function useOptionalDashboardLayout(): DashboardLayoutContextValue | null {
  return useContext(DashboardLayoutContext);
}
