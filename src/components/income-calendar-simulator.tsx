"use client";

import { useState } from "react";
import { FlaskConical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SIM_FREQUENCIES, type SimEntry, type SimFrequency } from "@/lib/income-calendar-simulation";

export type SimAsset = { id: string; name: string; category: string };

const FREQ_LABEL: Record<SimFrequency, string> = { monthly: "Every month", quarterly: "Every quarter", yearly: "Every year", once: "Once" };
const NEW_ASSET = "";

/**
 * What-if income or payments for the calendar: linked to one of your assets or to a simulated asset (say the rent of a
 * property you are considering). Kept on this device, shown apart from the real figures, never saved to your data.
 */
export function IncomeCalendarSimulator({
  entries,
  onChange,
  assets,
  defaultStart,
  baseCurrency,
  show,
  onShow,
}: {
  entries: SimEntry[];
  onChange: (next: SimEntry[]) => void;
  assets: SimAsset[];
  defaultStart: string;
  baseCurrency: string;
  show: boolean;
  onShow: (v: boolean) => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<SimEntry["kind"]>("income");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<SimFrequency>("monthly");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState("");
  const [day, setDay] = useState("1");
  const [assetId, setAssetId] = useState(NEW_ASSET);
  const [assetName, setAssetName] = useState("");

  const valid = label.trim() !== "" && Number(amount) > 0 && /^\d{4}-\d{2}$/.test(start) && (assetId !== NEW_ASSET || assetName.trim() !== "");

  function add() {
    if (!valid) return;
    const linked = assets.find((a) => a.id === assetId);
    const entry: SimEntry = {
      id: `sim-${Date.now()}-${entries.length}`,
      label: label.trim(),
      kind,
      amount: Number(amount),
      frequency,
      start,
      ...(end && frequency !== "once" ? { end } : {}),
      day: Math.min(28, Math.max(1, Math.round(Number(day)) || 1)),
      ...(linked ? { assetId: linked.id, assetName: linked.name } : { assetName: assetName.trim() }),
    };
    onChange([...entries, entry]);
    setLabel("");
    setAmount("");
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-medium text-foreground">What if: simulated income and payments</h2>
          <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={show} onChange={(e) => onShow(e.target.checked)} />
            Show them in the calendar
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Add an income or a payment linked to one of your assets, or to an asset you only simulate (a rent from a property you might buy, a new loan). Amounts in {baseCurrency}. They stay on this device and never touch your real figures.
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Name
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Rent of the new flat" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Type
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={kind} onChange={(e) => setKind(e.target.value as SimEntry["kind"])}>
              <option value="income">Income</option>
              <option value="payment">Payment</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Amount ({baseCurrency})
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            How often
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={frequency} onChange={(e) => setFrequency(e.target.value as SimFrequency)}>
              {SIM_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From (month)
            <Input type="month" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Until (optional)
            <Input type="month" value={end} disabled={frequency === "once"} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Day of the month
            <Input type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Linked to
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value={NEW_ASSET}>A simulated asset (new)</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.category})
                </option>
              ))}
            </select>
          </label>
          {assetId === NEW_ASSET && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
              Simulated asset name
              <Input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="Marina flat (simulation)" />
            </label>
          )}
        </div>
        <Button type="button" size="sm" disabled={!valid} onClick={add}>
          Add to the simulation
        </Button>

        {entries.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 text-foreground">
                  {e.label}
                  <span className="block text-xs text-muted-foreground">
                    {e.kind === "income" ? "Income" : "Payment"} · {e.amount.toLocaleString()} · {FREQ_LABEL[e.frequency]} from {e.start}
                    {e.end ? ` to ${e.end}` : ""} · {e.assetName}
                  </span>
                </span>
                <Button type="button" variant="ghost" size="xs" aria-label={`Remove ${e.label}`} onClick={() => onChange(entries.filter((x) => x.id !== e.id))}>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
