"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useState, useTransition } from "react";
import { Plus, Rocket, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STARTUP_TYPE_KEYS } from "@/components/startup-fields";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";
import { addFundingRound, deleteFundingRound } from "@/app/dashboard/startup-actions";
import {
  latestRound,
  parseStartupMetadata,
  sortedRounds,
  startupCostBasis,
  startupRoundHistory,
  startupValuation,
} from "@/lib/startups";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

/**
 * Detail-page card for a Startups holding: specification, valuation vs. cost,
 * the funding-round ledger (add / delete a round — the holding is revalued as
 * shares × the latest round's price) and a valuation-by-round chart.
 */
export function StartupCard({
  assetId,
  metadata: rawMetadata,
  shares,
  currency,
}: {
  assetId: string;
  metadata: unknown;
  shares: number;
  currency: string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [postMoney, setPostMoney] = useState("");

  const metadata = parseStartupMetadata(rawMetadata);
  const money = moneyFormatter(intlLocale, currency, { maximumFractionDigits: 2 });
  const rounds = sortedRounds(metadata.funding_rounds);
  const latest = latestRound(metadata);
  const value = startupValuation(metadata, shares);
  const cost = startupCostBasis(metadata, shares);
  const gain = cost > 0 ? { amount: value - cost, multiple: value / cost } : null;
  const history = startupRoundHistory(metadata, shares);

  function fail(message: string) {
    setError(message.startsWith("startup_") ? t(message as TranslationKey) : message);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addFundingRound(assetId, {
        date,
        name,
        price_per_share: Number(price),
        post_money_valuation: postMoney.trim() === "" ? null : Number(postMoney),
      });
      if (!result.ok) return fail(result.error);
      setName("");
      setPrice("");
      setPostMoney("");
    });
  }

  function handleDelete(roundId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteFundingRound(assetId, roundId);
      if (!result.ok) fail(result.error);
    });
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Rocket className="size-4 text-primary" />
          {t("startup_details")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label={t("startup_company")} value={metadata.company_name} />
          <Field label={t("startup_sector")} value={metadata.sector} />
          <Field label={t("startup_investment_type")} value={t(STARTUP_TYPE_KEYS[metadata.investment_type])} />
          <Field label={t("startup_shares")} value={shares.toLocaleString(intlLocale)} />
          <Field
            label={metadata.investment_type === "bspce_options" ? t("startup_strike") : t("startup_avg_cost")}
            value={metadata.avg_cost_per_share != null ? maskValue(money.format(metadata.avg_cost_per_share)) : null}
          />
          <Field
            label={t("startup_latest_price")}
            value={latest ? `${maskValue(money.format(latest.price_per_share))} · ${latest.name}` : null}
          />
          <Field label={t("startup_current_value")} value={maskValue(money.format(value))} />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("startup_vs_cost")}</p>
            {gain ? (
              <p className={cn("text-sm font-medium tabular-nums", gain.amount >= 0 ? "text-success" : "text-destructive")}>
                {gain.amount >= 0 ? "+" : "-"}
                {maskValue(money.format(Math.abs(gain.amount)))} ({gain.multiple.toFixed(2)}x)
              </p>
            ) : (
              <p className="text-sm text-foreground">—</p>
            )}
          </div>
        </div>

        {history.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t("startup_chart_title")}</p>
            <div className="h-56 w-full" role="img" aria-label={t("startup_chart_title")}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    width={64}
                    tickFormatter={(v: number) => maskValue(new Intl.NumberFormat(intlLocale, { notation: "compact" }).format(v))}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                    formatter={(v) => maskValue(money.format(Number(v)))}
                    labelFormatter={(label, items) => `${label} · ${(items?.[0]?.payload as { name?: string } | undefined)?.name ?? ""}`}
                  />
                  <Line type="stepAfter" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("startup_rounds")}</p>
          {rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("startup_rounds_empty")}</p>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-muted-foreground">{t("startup_round_date")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("startup_round_name")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("startup_round_price")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("startup_round_post_money")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("startup_current_value")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...rounds].reverse().map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums text-foreground">{r.date}</TableCell>
                      <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                      <TableCell className="text-end tabular-nums text-foreground">
                        {maskValue(money.format(r.price_per_share))}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {r.post_money_valuation != null ? maskValue(money.format(r.post_money_valuation)) : "—"}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-foreground">
                        {maskValue(
                          money.format(
                            startupRoundHistory({ ...metadata, funding_rounds: [r] }, shares)[0]?.value ?? 0,
                          ),
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("delete")}
                          disabled={isPending}
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <form onSubmit={handleAdd} className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">{t("startup_add_round")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="round_date">{t("startup_round_date")}</Label>
              <Input id="round_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="round_name">{t("startup_round_name")}</Label>
              <Input
                id="round_name"
                required
                placeholder="Series A"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="round_price">{t("startup_round_price")}</Label>
              <Input
                id="round_price"
                type="number"
                step="any"
                min="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="round_post">{t("startup_round_post_money")}</Label>
              <Input
                id="round_post"
                type="number"
                step="any"
                min="0"
                value={postMoney}
                onChange={(e) => setPostMoney(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("startup_round_hint")}</p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="sm" disabled={isPending}>
            <Plus className="size-4" />
            {t("startup_add_round")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
