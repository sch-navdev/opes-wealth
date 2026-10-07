"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronsUpDown, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryIcon, categoryIconFor } from "@/components/category-icon";
import { useIrrText } from "@/components/irr-compare-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { matchesSearch } from "@/lib/command-menu-items";
import { getCurrencySymbol } from "@/lib/currencies";
import type { IrrKey } from "@/lib/irr-compare-labels";
import type { ComparableHolding, CompareSideResult, IrrFailure } from "@/lib/irr-compare-types";
import {
  formatMoney,
  formatRate,
  isHoldingAvailable,
  type ManualField,
  type ManualFields,
  type ManualValidation,
} from "@/lib/irr-compare-view";
import { cn } from "@/lib/utils";

export type SideId = "a" | "b";
export type SideState = ManualFields & { kind: "manual" | "holding"; holdingId: string };

const ERROR_KEYS = {
  required: "irr_err_required",
  number: "irr_err_number",
  negative: "irr_err_negative",
  final: "irr_err_final",
  years: "irr_err_years",
} as const satisfies Record<string, IrrKey>;

const FAILURE_KEYS = {
  no_sign_change: "irr_fail_no_sign_change",
  not_enough_flows: "irr_fail_not_enough_flows",
  no_solution: "irr_fail_no_solution",
} as const satisfies Record<IrrFailure, IrrKey>;

const UNAVAILABLE_KEYS = {
  missing_purchase_price: "irr_unavail_missing_purchase_price",
  missing_purchase_date: "irr_unavail_missing_purchase_date",
  missing_value: "irr_unavail_missing_value",
  unsupported_category: "irr_unavail_unsupported_category",
  missing_fx: "irr_unavail_missing_fx",
  no_sign_change: "irr_unavail_no_sign_change",
} as const satisfies Record<NonNullable<ComparableHolding["unavailable"]>, IrrKey>;

const FIELDS: { field: ManualField; labelKey: IrrKey }[] = [
  { field: "initial", labelKey: "irr_field_initial" },
  { field: "monthly", labelKey: "irr_field_monthly" },
  { field: "final", labelKey: "irr_field_final" },
  { field: "years", labelKey: "irr_field_years" },
];

function HoldingIcon({ category, name }: { category: string; name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center border border-border bg-muted text-xs font-medium text-muted-foreground"
    >
      {categoryIconFor(category) ? <CategoryIcon name={category} /> : (name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function HoldingPicker({
  side,
  holdings,
  value,
  onChange,
}: {
  side: SideId;
  holdings: ComparableHolding[];
  value: string;
  onChange: (id: string) => void;
}) {
  const tx = useIrrText();
  const [open, setOpen] = useState(false);
  const selected = holdings.find((h) => h.id === value);
  const reasonOf = (h: ComparableHolding) => (h.unavailable ? tx(UNAVAILABLE_KEYS[h.unavailable]) : tx("irr_unavail_missing_value"));

  if (holdings.length === 0) {
    return (
      <p data-testid={`irr-${side}-no-holdings`} className="text-sm text-muted-foreground">
        {tx("irr_holding_none")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`irr-${side}-holding`}>{tx("irr_holding_label")}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={`irr-${side}-holding`}
            data-testid={`irr-${side}-holding`}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected && <HoldingIcon category={selected.category} name={selected.name} />}
              <span className="truncate">{selected ? selected.name : tx("irr_holding_placeholder")}</span>
            </span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,26rem)] border-border bg-popover p-0" align="start">
          <Command
            filter={(v, search, keywords) => (matchesSearch(keywords?.length ? keywords.join(" ") : v, search) ? 1 : 0)}
          >
            <CommandInput placeholder={tx("irr_holding_search")} />
            <CommandList>
              <CommandEmpty>{tx("irr_holding_empty")}</CommandEmpty>
              <CommandGroup>
                {[...holdings].sort((x, y) => x.name.localeCompare(y.name)).map((h) => {
                  const available = isHoldingAvailable(h);
                  return (
                    <CommandItem
                      key={h.id}
                      value={h.id}
                      keywords={[h.name, h.category]}
                      disabled={!available}
                      data-testid={`irr-${side}-option-${h.id}`}
                      onSelect={() => {
                        onChange(h.id);
                        setOpen(false);
                      }}
                      className="items-start gap-2"
                    >
                      <HoldingIcon category={h.category} name={h.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-foreground">{h.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{h.category}</span>
                        {!available && (
                          <span
                            data-testid={`irr-${side}-reason-${h.id}`}
                            className="mt-0.5 flex items-start gap-1 text-xs text-destructive"
                          >
                            <CircleSlash className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                            <span>
                              {tx("irr_unavailable_badge")}: {reasonOf(h)}
                            </span>
                          </span>
                        )}
                      </span>
                      <Check
                        className={cn("mt-1 size-4 shrink-0", value === h.id ? "opacity-100" : "opacity-0")}
                        aria-hidden="true"
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Warning({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <li
      data-testid={id}
      className="flex items-start gap-2 border border-primary/50 bg-primary/10 p-2 text-xs text-foreground"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/** One side (A or B): source switch, the inputs, and the computed figures. */
export function IrrCompareCard({
  side,
  state,
  onChange,
  holdings,
  baseCurrency,
  validation,
  result,
}: {
  side: SideId;
  state: SideState;
  onChange: (next: SideState) => void;
  holdings: ComparableHolding[];
  baseCurrency: string;
  validation: ManualValidation;
  /** null while the side cannot be computed (invalid fields / nothing chosen). */
  result: CompareSideResult | null;
}) {
  const tx = useIrrText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [touched, setTouched] = useState<Partial<Record<ManualField, boolean>>>({});
  const title = tx(side === "a" ? "irr_side_a" : "irr_side_b");
  const money = (n: number, currency = baseCurrency) => maskValue(formatMoney(n, intlLocale, currency));
  const symbol = getCurrencySymbol(baseCurrency, intlLocale);
  const holding = holdings.find((h) => h.id === state.holdingId);
  const included = holding?.includes;

  const set = (patch: Partial<SideState>) => onChange({ ...state, ...patch });

  return (
    <Card data-testid={`irr-card-${side}`} className="min-w-0">
      <CardHeader className="gap-3">
        <CardTitle className="text-lg" id={`irr-${side}-title`}>
          {title}
        </CardTitle>
        <fieldset className="flex w-full border border-border" aria-label={tx("irr_source_aria", { side: title })}>
          {(["manual", "holding"] as const).map((kind) => (
            <label
              key={kind}
              className="relative flex-1 cursor-pointer text-center text-sm has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name={`irr-${side}-source`}
                data-testid={`irr-${side}-source-${kind}`}
                className="peer sr-only"
                checked={state.kind === kind}
                onChange={() => set({ kind })}
              />
              <span className="block px-3 py-2 transition-colors motion-reduce:transition-none">
                {tx(kind === "manual" ? "irr_source_manual" : "irr_source_holding")}
              </span>
            </label>
          ))}
        </fieldset>
      </CardHeader>

      <CardContent className="space-y-4">
        {state.kind === "manual" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(({ field, labelKey }) => {
              const error = validation.errors[field];
              const show = !!error && (touched[field] || state[field].trim() !== "");
              const errId = `irr-${side}-${field}-err`;
              return (
                <div key={field} className="space-y-1">
                  <Label htmlFor={`irr-${side}-${field}`}>{tx(labelKey)}</Label>
                  <div className="relative">
                    {field !== "years" && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-sm text-muted-foreground"
                      >
                        {symbol}
                      </span>
                    )}
                    <Input
                      id={`irr-${side}-${field}`}
                      data-testid={`irr-${side}-${field}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={state[field]}
                      aria-invalid={show ? true : undefined}
                      aria-describedby={show ? errId : undefined}
                      className={field !== "years" ? "ps-10" : undefined}
                      onChange={(e) => set({ [field]: e.target.value } as Partial<SideState>)}
                      onBlur={() => setTouched((t) => ({ ...t, [field]: true }))}
                    />
                  </div>
                  {show && error && (
                    <p id={errId} data-testid={`irr-${side}-err-${field}`} className="text-xs text-destructive">
                      {tx(ERROR_KEYS[error])}
                    </p>
                  )}
                </div>
              );
            })}
            {validation.nothingInvested && !validation.blank && (
              <p data-testid={`irr-${side}-err-nothing`} className="text-xs text-destructive sm:col-span-2">
                {tx("irr_err_nothing")}
              </p>
            )}
          </div>
        ) : (
          <HoldingPicker
            side={side}
            holdings={holdings}
            value={state.holdingId}
            onChange={(id) => set({ holdingId: id })}
          />
        )}

        <div aria-live="polite" className="space-y-3 border-t border-border pt-4">
          {!result ? (
            <p data-testid={`irr-${side}-pending`} className="text-sm text-muted-foreground">
              {tx(state.kind === "manual" ? "irr_manual_pending" : "irr_holding_pending")}
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs text-muted-foreground">{tx("irr_result_rate")}</p>
                {result.irr.ok ? (
                  <p data-testid={`irr-${side}-rate`} className="text-3xl font-semibold tabular-nums text-primary">
                    {formatRate(result.irr.rate, intlLocale)}
                  </p>
                ) : (
                  <p data-testid={`irr-${side}-failure`} className="text-sm text-destructive">
                    {tx(FAILURE_KEYS[result.irr.reason])}
                  </p>
                )}
                {result.plan && (
                  <p className="text-xs text-muted-foreground">
                    {tx("irr_result_nominal", { rate: formatRate(result.plan.nominalAnnualRate, intlLocale) })}
                  </p>
                )}
              </div>

              {result.plan && (
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  {(
                    [
                      ["deposits", "irr_result_deposits", result.plan.totalDeposits],
                      ["interest", "irr_result_interest", result.plan.totalInterest],
                      ["final", "irr_result_final", result.plan.finalCapital],
                    ] as const
                  ).map(([id, key, amount]) => (
                    <div key={id} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{tx(key)}</dt>
                      <dd data-testid={`irr-${side}-res-${id}`} className="truncate font-medium tabular-nums text-foreground">
                        {money(amount)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {result.plan && <p className="text-xs text-muted-foreground">{tx("irr_manual_note")}</p>}

              {included && (
                <div data-testid={`irr-${side}-includes`} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{tx("irr_includes_title")}</p>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {(
                      [
                        ["purchase", "irr_inc_purchase", included.purchase],
                        ["income", "irr_inc_income", included.income],
                        ["value", "irr_inc_value", included.currentValue],
                        ["financing", "irr_inc_financing", included.financing],
                      ] as const
                    ).map(([id, key, on]) => (
                      <li key={id} data-testid={`irr-${side}-inc-${id}`} data-included={on} className="flex items-center gap-1">
                        <span aria-hidden="true">{on ? "✓" : "✗"}</span>
                        <span className={on ? "text-foreground" : "text-muted-foreground"}>
                          {tx(key)}: {tx(on ? "irr_included" : "irr_excluded")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.warnings.length > 0 && (
                <ul className="space-y-2">
                  {result.warnings.includes("income_excluded") && (
                    <Warning id={`irr-${side}-warn-income`}>{tx("irr_warn_income")}</Warning>
                  )}
                  {result.warnings.includes("financing_excluded") && (
                    <Warning id={`irr-${side}-warn-financing`}>{tx("irr_warn_financing")}</Warning>
                  )}
                  {result.warnings.includes("multiple_roots") && (
                    <Warning id={`irr-${side}-warn-multiple`}>{tx("irr_warn_multiple")}</Warning>
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
