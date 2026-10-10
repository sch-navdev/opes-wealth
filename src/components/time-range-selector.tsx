"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBankingText } from "@/components/banking-text";
import type { BankingKey } from "@/lib/banking-brokerage-labels";
import { RANGE_PRESETS, isRangePreset, readDefaultRange, writeDefaultRange, type RangePreset, type TimeRange } from "@/lib/time-range";

const LABEL: Record<RangePreset, BankingKey> = {
  all: "trange_all",
  "1m": "trange_1m",
  "3m": "trange_3m",
  "6m": "trange_6m",
  "1y": "trange_1y",
};

/**
 * Time-range buttons for a chart: All time, 1 month, 3 months, 6 months, 1 year (counted back from today) or
 * custom dates. The user's default preset is remembered per device ("Use as my default") and applied when a
 * chart first opens. Controlled: the parent holds the range and filters its data with `filterByRange`.
 */
export function TimeRangeSelector({ value, onChange }: { value: TimeRange; onChange: (next: TimeRange) => void }) {
  const tx = useBankingText();
  const [stored, setStored] = useState<RangePreset>("all");
  const [saved, setSaved] = useState(false);

  // The device's default is read after mount (server and client markup agree), then applied once.
  useEffect(() => {
    const d = readDefaultRange();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored(d);
    if (d !== "all") onChange({ preset: d });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const custom = value.preset === "custom";
  const canSave = isRangePreset(value.preset) && value.preset !== stored;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tx("trange_label")}>
      {RANGE_PRESETS.map((p) => (
        <Button
          key={p}
          type="button"
          size="xs"
          variant={value.preset === p ? "default" : "outline"}
          aria-pressed={value.preset === p}
          onClick={() => {
            setSaved(false);
            onChange({ preset: p });
          }}
        >
          {tx(LABEL[p])}
        </Button>
      ))}
      <Button
        type="button"
        size="xs"
        variant={custom ? "default" : "outline"}
        aria-pressed={custom}
        onClick={() => {
          setSaved(false);
          onChange({ preset: "custom", from: value.from, to: value.to });
        }}
      >
        {tx("trange_custom")}
      </Button>
      {custom && (
        <>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            {tx("trange_from")}
            <Input type="date" className="h-7 w-36" value={value.from ?? ""} onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })} />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            {tx("trange_to")}
            <Input type="date" className="h-7 w-36" value={value.to ?? ""} onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })} />
          </label>
        </>
      )}
      {canSave && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => {
            writeDefaultRange(value.preset as RangePreset);
            setStored(value.preset as RangePreset);
            setSaved(true);
          }}
        >
          {tx("trange_set_default")}
        </Button>
      )}
      {saved && (
        <span className="text-xs text-muted-foreground" role="status">
          {tx("trange_default_saved")}
        </span>
      )}
    </div>
  );
}
