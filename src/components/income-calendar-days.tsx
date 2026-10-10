"use client";

import { useMemo, useState } from "react";
import type { DayFlow, DayItem } from "@/lib/income-calendar-daily";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_LABEL: Record<DayItem["kind"], string> = {
  earned: "Earned",
  passive: "Passive",
  payment: "Payment",
  sim_income: "What-if income",
  sim_payment: "What-if payment",
};

/**
 * One month as a calendar grid: every day shows what comes in (green), what goes out (red) and the position at the
 * end of the day; a line under the grid draws that position across the month. Click a day for its items. The point
 * is to see WHERE in the month the cash gets tight, not only that the month nets out.
 */
export function IncomeCalendarDays({
  days,
  monthLabel,
  money,
  mask,
  startPosition,
}: {
  days: DayFlow[];
  monthLabel: string;
  money: { format: (n: number) => string };
  mask: (v: string) => string;
  /** Position at the start of the month. */
  startPosition: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const m = (n: number) => mask(money.format(n));
  // Monday-first offset of the 1st.
  const offset = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;

  const low = days.reduce((lo, d) => (d.balance < lo.balance ? d : lo), days[0]);
  const line = useMemo(() => {
    const values = [startPosition, ...days.map((d) => d.balance)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const w = 100;
    const h = 100;
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`);
    const zero = min <= 0 && max >= 0 ? h - ((0 - min) / span) * h : null;
    return { pts: pts.join(" "), zero };
  }, [days, startPosition]);

  const open = picked != null ? days[picked - 1] : null;

  return (
    <div className="space-y-3" data-testid="income-days">
      <p className="text-xs text-muted-foreground">
        {monthLabel}: you start at {m(startPosition)} and finish at {m(days[days.length - 1].balance)}; the lowest point is {m(low.balance)} on day {low.day}.
      </p>
      <div role="group" aria-label={monthLabel} className="grid grid-cols-7 gap-1 text-xs">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 text-center text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} aria-hidden="true" />
        ))}
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            data-day={d.day}
            aria-pressed={picked === d.day}
            aria-label={`${d.date}: in ${d.inflow}, out ${d.outflow}, position ${Math.round(d.balance)}`}
            onClick={() => setPicked(picked === d.day ? null : d.day)}
            className={cn(
              "flex min-h-16 flex-col items-stretch rounded-md border p-1 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              picked === d.day ? "border-primary bg-primary/5" : "border-border bg-background",
              d.balance < 0 && "bg-destructive/5",
            )}
          >
            <span className="font-medium text-foreground">{d.day}</span>
            {d.inflow > 0 && <span className="tabular-nums text-success">+{m(d.inflow)}</span>}
            {d.outflow > 0 && <span className="tabular-nums text-destructive">-{m(d.outflow)}</span>}
            <span className={cn("mt-auto tabular-nums text-muted-foreground", d.balance < 0 && "text-destructive")}>{m(d.balance)}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Position through the month</p>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full rounded-md border border-border bg-muted/20" role="img" aria-label="Position through the month">
          {line.zero != null && <line x1="0" x2="100" y1={line.zero} y2={line.zero} stroke="var(--color-muted-foreground)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
          <polyline points={line.pts} fill="none" stroke="var(--color-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div aria-live="polite" className="rounded-md border border-border">
        {open ? (
          <div className="space-y-1 p-3">
            <p className="text-sm font-medium text-foreground">
              {open.date}: position {m(open.balance)}
            </p>
            {open.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing moves on this day.</p>
            ) : (
              <ul className="divide-y divide-border">
                {open.items.map((item, i) => (
                  <li key={`${item.label}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0 text-foreground">
                      <span className="truncate">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {KIND_LABEL[item.kind]}
                        {item.sub ? ` · ${item.sub}` : ""}
                      </span>
                    </span>
                    <span className={cn("shrink-0 tabular-nums", item.amount >= 0 ? "text-success" : "text-destructive")}>{m(item.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="p-3 text-xs text-muted-foreground">Select a day to see what moves on it. Items with no date of their own fall on the 1st.</p>
        )}
      </div>
    </div>
  );
}
