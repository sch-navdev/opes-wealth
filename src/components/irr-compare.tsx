"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IrrCompareCard, type SideId, type SideState } from "@/components/irr-compare-card";
import { IrrComparePanel } from "@/components/irr-compare-panel";
import { useIrrText } from "@/components/irr-compare-text";
import { useLanguage } from "@/context/language-context";
import type { ComparableHolding, CompareSideResult } from "@/lib/irr-compare-types";
import {
  computeHoldingSide,
  computeManualSide,
  isHoldingAvailable,
  validateManual,
  type ManualValidation,
} from "@/lib/irr-compare-view";
import { useStored } from "@/lib/use-stored";

export const STORAGE_KEY = "opes-irr-compare";

const EMPTY: SideState = { kind: "manual", initial: "", monthly: "", final: "", years: "", holdingId: "" };
/** Side A starts with the advisor's example so the page shows a result straight away. */
export const DEFAULT_STATES: Record<SideId, SideState> = {
  a: { ...EMPTY, initial: "30000", monthly: "300", final: "150000", years: "20" },
  b: EMPTY,
};

function isSideState(v: unknown): v is SideState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    (s.kind === "manual" || s.kind === "holding") &&
    ["initial", "monthly", "final", "years", "holdingId"].every((k) => typeof s[k] === "string")
  );
}

/** The remembered pair of selections; anything malformed falls back to the defaults. */
export function parseStored(raw: string): Record<SideId, SideState> {
  if (!raw) return DEFAULT_STATES;
  try {
    const parsed = JSON.parse(raw) as { a?: unknown; b?: unknown };
    return {
      a: isSideState(parsed.a) ? parsed.a : DEFAULT_STATES.a,
      b: isSideState(parsed.b) ? parsed.b : DEFAULT_STATES.b,
    };
  } catch {
    return DEFAULT_STATES;
  }
}

function evaluate(
  state: SideState,
  holdings: ComparableHolding[],
  baseCurrency: string,
  locale: string,
  label: string,
): { validation: ManualValidation; result: CompareSideResult | null } {
  const validation = validateManual(state, locale);
  if (state.kind === "manual") {
    return { validation, result: validation.input ? computeManualSide(label, baseCurrency, validation.input) : null };
  }
  const holding = holdings.find((h) => h.id === state.holdingId);
  return { validation, result: holding && isHoldingAvailable(holding) ? computeHoldingSide(holding.name, holding) : null };
}

/**
 * IRR (TRI) comparison: two cards (manual savings plan or one of the user's holdings) and a neutral
 * comparison panel. Nothing here ranks the two sides or advises.
 */
export function IrrCompare({
  holdings,
  baseCurrency,
  loadFailed = false,
}: {
  holdings: ComparableHolding[];
  baseCurrency: string;
  /** The holdings could not be loaded: manual mode still works. */
  loadFailed?: boolean;
}) {
  const tx = useIrrText();
  const { intlLocale } = useLanguage();
  const [stored, setStored] = useStored(STORAGE_KEY);
  const [override, setOverride] = useState<Record<SideId, SideState> | null>(null);
  const states = override ?? parseStored(stored);

  function update(side: SideId, next: SideState) {
    const merged = { ...states, [side]: next };
    setOverride(merged);
    setStored(JSON.stringify(merged));
  }

  const labelA = tx("irr_side_a");
  const labelB = tx("irr_side_b");
  const a = useMemo(
    () => evaluate(states.a, holdings, baseCurrency, intlLocale, labelA),
    [states.a, holdings, baseCurrency, intlLocale, labelA],
  );
  const b = useMemo(
    () => evaluate(states.b, holdings, baseCurrency, intlLocale, labelB),
    [states.b, holdings, baseCurrency, intlLocale, labelB],
  );

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tx("irr_title")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{tx("irr_subtitle")}</p>
        </div>
        <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" />
          {tx("irr_print")}
        </Button>
      </div>

      {loadFailed && (
        <p
          role="alert"
          data-testid="irr-load-failed"
          className="border border-destructive/60 bg-destructive/10 p-3 text-sm text-foreground"
        >
          {tx("irr_load_failed")}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <IrrCompareCard
          side="a"
          state={states.a}
          onChange={(next) => update("a", next)}
          holdings={holdings}
          baseCurrency={baseCurrency}
          validation={a.validation}
          result={a.result}
        />
        <IrrCompareCard
          side="b"
          state={states.b}
          onChange={(next) => update("b", next)}
          holdings={holdings}
          baseCurrency={baseCurrency}
          validation={b.validation}
          result={b.result}
        />
      </div>

      <IrrComparePanel a={a.result} b={b.result} />
    </div>
  );
}
