"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useTierMotion } from "@/components/tier-gate";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { summarizeTaxDepreciation, type ExpertPanelsData } from "@/lib/dashboard-expert";
import { tileEntranceStyle } from "@/lib/dashboard-tiers";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* ---------- sorting ---------- */

type SortState<K extends string> = { key: K; dir: "asc" | "desc" } | null;

/** Click cycles asc -> desc -> original order (same behaviour as the portfolio table). */
function useSort<K extends string>() {
  const [sort, setSort] = useState<SortState<K>>(null);
  const onSort = (key: K) =>
    setSort((prev) => (prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null));
  return { sort, onSort };
}

function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  accessors: Record<K, (row: T) => string | number | null>,
  locale: string,
): T[] {
  if (!sort) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  const get = accessors[sort.key];
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    // Empty values always sort last, whatever the direction.
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return factor * (x - y);
    return factor * String(x).localeCompare(String(y), locale);
  });
}

function SortHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  sortLabel,
  numeric,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  sortLabel: string;
  numeric?: boolean;
}) {
  const active = sort?.key === sortKey ? sort.dir : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
      className={cn("sticky top-0 z-10 bg-card text-xs", numeric && "text-end")}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={sortLabel}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm uppercase tracking-wide outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          numeric && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0" aria-hidden />
      </button>
    </TableHead>
  );
}

/** Scroll container: horizontal scroll on narrow screens, capped height so the sticky header works. */
function Scroller({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-80 overflow-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full caption-bottom text-sm tabular-nums">{children}</table>
    </div>
  );
}

const numCell = "text-end tabular-nums whitespace-nowrap";

/* ---------- panels ---------- */

type Props = { data: ExpertPanelsData; baseCurrency: string };

export function DashboardExpertPanels({ data, baseCurrency }: Props) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const motion = useTierMotion();

  const money = useMemo(
    () => new Intl.NumberFormat(intlLocale, { style: "currency", currency: baseCurrency, maximumFractionDigits: 0 }),
    [intlLocale, baseCurrency],
  );
  const ratio = useMemo(
    () => new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [intlLocale],
  );
  const pct1 = useMemo(
    () => new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [intlLocale],
  );
  const fmtMoney = (n: number) => maskValue(money.format(n));
  const fmtRatio = (n: number | null) => (n == null ? "-" : maskValue(`${ratio.format(n)}x`));
  const fmtIrr = (n: number | null) => (n == null ? "-" : `${pct1.format(n * 100)}%`);

  const card = "animate-in fade-in slide-in-from-bottom-2 gap-4 border-border bg-card py-5 motion-reduce:animate-none min-w-0";

  return (
    <section aria-label={t("expert_raw_title")} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <RawDataPanel
        data={data}
        className={card}
        style={tileEntranceStyle(motion, 0)}
        baseCurrency={baseCurrency}
        fmtMoney={fmtMoney}
      />
      <PrivateEquityPanel
        data={data}
        className={card}
        style={tileEntranceStyle(motion, 1)}
        baseCurrency={baseCurrency}
        fmtMoney={fmtMoney}
        fmtRatio={fmtRatio}
        fmtIrr={fmtIrr}
      />
      <TaxPanel
        data={data}
        className={card}
        style={tileEntranceStyle(motion, 2)}
        baseCurrency={baseCurrency}
        fmtMoney={fmtMoney}
      />
      <ExposurePanel
        data={data}
        className={card}
        style={tileEntranceStyle(motion, 3)}
        baseCurrency={baseCurrency}
        fmtMoney={fmtMoney}
        pct1={pct1}
      />
    </section>
  );
}

type PanelStyle = ReturnType<typeof tileEntranceStyle>;

function PanelShell({
  title,
  description,
  className,
  style,
  children,
}: {
  title: string;
  description?: string;
  className: string;
  style: PanelStyle;
  children: ReactNode;
}) {
  return (
    <Card className={className} style={style}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/* (i) raw data */

type RawKey = "name" | "category" | "currency" | "quantity" | "native" | "base" | "purchase";

function RawDataPanel({
  data,
  className,
  style,
  baseCurrency,
  fmtMoney,
}: {
  data: ExpertPanelsData;
  className: string;
  style: PanelStyle;
  baseCurrency: string;
  fmtMoney: (n: number) => string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const { sort, onSort } = useSort<RawKey>();
  const qty = useMemo(() => new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 6 }), [intlLocale]);
  const native = useMemo(() => new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 }), [intlLocale]);

  const rows = useMemo(
    () =>
      sortRows(
        data.rawRows,
        sort,
        {
          name: (r) => r.name,
          category: (r) => r.category,
          currency: (r) => r.currency,
          quantity: (r) => r.quantity,
          native: (r) => (r.isLiability ? -r.nativeValue : r.nativeValue),
          base: (r) => r.baseValue,
          purchase: (r) => r.purchaseDate,
        },
        intlLocale,
      ),
    [data.rawRows, sort, intlLocale],
  );

  const head = (key: RawKey, label: string, numeric?: boolean) => (
    <SortHead key={key} label={label} sortKey={key} sort={sort} onSort={onSort} numeric={numeric} sortLabel={t("grid_sort_by", { col: label })} />
  );
  const valueLabel = t("grid_col_value", { currency: baseCurrency });

  return (
    <PanelShell title={t("expert_raw_title")} description={t("expert_raw_desc")} className={className} style={style}>
      {data.rawRows.length === 0 ? (
        <EmptyNote>{t("expert_raw_empty")}</EmptyNote>
      ) : (
        <Scroller label={t("expert_raw_title")}>
          <thead>
            <TableRow className="hover:bg-transparent">
              {head("name", t("grid_col_name"))}
              {head("category", t("grid_col_category"))}
              {head("currency", t("expert_raw_col_currency"))}
              {head("quantity", t("grid_col_quantity"), true)}
              {head("native", t("expert_raw_col_native"), true)}
              {head("base", valueLabel, true)}
              {head("purchase", t("expert_raw_col_purchase"))}
            </TableRow>
          </thead>
          <tbody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-48 truncate font-medium" title={r.name}>
                  {r.name}
                  {r.isLiability ? <span className="ms-1 text-xs text-muted-foreground">({t("expert_raw_liability")})</span> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{r.category}</TableCell>
                <TableCell className="whitespace-nowrap">{r.currency}</TableCell>
                <TableCell className={numCell}>{maskValue(qty.format(r.quantity))}</TableCell>
                <TableCell className={numCell}>{maskValue(native.format(r.isLiability ? -r.nativeValue : r.nativeValue))}</TableCell>
                <TableCell className={cn(numCell, r.baseValue < 0 && "text-destructive")}>{fmtMoney(r.baseValue)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{r.purchaseDate ?? "-"}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Scroller>
      )}
    </PanelShell>
  );
}

/* (ii) private equity */

type PeKey = "name" | "commitment" | "called" | "unfunded" | "nav" | "distributions" | "dpi" | "tvpi" | "multiple" | "irr";

function PrivateEquityPanel({
  data,
  className,
  style,
  baseCurrency,
  fmtMoney,
  fmtRatio,
  fmtIrr,
}: {
  data: ExpertPanelsData;
  className: string;
  style: PanelStyle;
  baseCurrency: string;
  fmtMoney: (n: number) => string;
  fmtRatio: (n: number | null) => string;
  fmtIrr: (n: number | null) => string;
}) {
  const { t, intlLocale } = useLanguage();
  const { sort, onSort } = useSort<PeKey>();

  const rows = useMemo(
    () =>
      sortRows(
        data.privateEquity,
        sort,
        {
          name: (r) => r.name,
          commitment: (r) => r.commitment,
          called: (r) => r.called,
          unfunded: (r) => r.unfunded,
          nav: (r) => r.nav,
          distributions: (r) => r.distributions,
          dpi: (r) => r.dpi,
          tvpi: (r) => r.tvpi,
          multiple: (r) => r.projectedMultiple,
          irr: (r) => r.projectedIrr,
        },
        intlLocale,
      ),
    [data.privateEquity, sort, intlLocale],
  );

  const head = (key: PeKey, label: string, numeric?: boolean) => (
    <SortHead key={key} label={label} sortKey={key} sort={sort} onSort={onSort} numeric={numeric} sortLabel={t("grid_sort_by", { col: label })} />
  );

  return (
    <PanelShell
      title={t("expert_pe_title")}
      description={t("expert_pe_desc", { currency: baseCurrency })}
      className={className}
      style={style}
    >
      {data.privateEquity.length === 0 ? (
        <EmptyNote>{t("expert_pe_empty")}</EmptyNote>
      ) : (
        <>
          <Scroller label={t("expert_pe_title")}>
            <thead>
              <TableRow className="hover:bg-transparent">
                {head("name", t("grid_col_name"))}
                {head("commitment", t("expert_pe_col_commitment"), true)}
                {head("called", t("expert_pe_col_called"), true)}
                {head("unfunded", t("expert_pe_col_unfunded"), true)}
                {head("nav", t("expert_pe_col_nav"), true)}
                {head("distributions", t("expert_pe_col_distributions"), true)}
                {head("dpi", t("expert_pe_col_dpi"), true)}
                {head("tvpi", t("expert_pe_col_tvpi"), true)}
                {head("multiple", t("expert_pe_col_multiple"), true)}
                {head("irr", t("expert_pe_col_irr"), true)}
              </TableRow>
            </thead>
            <tbody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-48 truncate font-medium" title={r.name}>
                    {r.name}
                  </TableCell>
                  <TableCell className={numCell}>{r.commitment == null ? "-" : fmtMoney(r.commitment)}</TableCell>
                  <TableCell className={numCell}>{fmtMoney(r.called)}</TableCell>
                  <TableCell className={numCell}>{fmtMoney(r.unfunded)}</TableCell>
                  <TableCell className={numCell}>{fmtMoney(r.nav)}</TableCell>
                  <TableCell className={numCell}>{fmtMoney(r.distributions)}</TableCell>
                  <TableCell className={numCell}>{fmtRatio(r.dpi)}</TableCell>
                  <TableCell className={numCell}>{fmtRatio(r.tvpi)}</TableCell>
                  <TableCell className={numCell}>{fmtRatio(r.projectedMultiple)}</TableCell>
                  <TableCell className={numCell}>{fmtIrr(r.projectedIrr)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Scroller>
          <p className="text-xs text-muted-foreground">{t("expert_pe_note")}</p>
        </>
      )}
    </PanelShell>
  );
}

/* (iii) tax and depreciation */

type TaxKey = "name" | "kind" | "cost" | "value" | "gain";

function TaxPanel({
  data,
  className,
  style,
  baseCurrency,
  fmtMoney,
}: {
  data: ExpertPanelsData;
  className: string;
  style: PanelStyle;
  baseCurrency: string;
  fmtMoney: (n: number) => string;
}) {
  const { t, intlLocale } = useLanguage();
  const uid = useId();
  const [depreciationView, setDepreciationView] = useState(false);
  const [applyTax, setApplyTax] = useState(false);
  // Held as text so the field can be emptied while typing; a blank or invalid entry counts as 0.
  const [rateText, setRateText] = useState("0");
  const ratePercent = Number.parseFloat(rateText);
  const { sort, onSort } = useSort<TaxKey>();

  const summary = useMemo(
    () => summarizeTaxDepreciation(data.taxDepreciation, { depreciationView, applyTax, ratePercent }),
    [data.taxDepreciation, depreciationView, applyTax, ratePercent],
  );

  const rows = useMemo(
    () =>
      sortRows(
        summary.rows,
        sort,
        {
          name: (r) => r.name,
          kind: (r) => r.kind,
          cost: (r) => r.costBasis,
          value: (r) => r.value,
          gain: (r) => r.gain,
        },
        intlLocale,
      ),
    [summary.rows, sort, intlLocale],
  );

  const head = (key: TaxKey, label: string, numeric?: boolean) => (
    <SortHead key={key} label={label} sortKey={key} sort={sort} onSort={onSort} numeric={numeric} sortLabel={t("grid_sort_by", { col: label })} />
  );
  const kindLabel = (kind: string) => t(`expert_tax_kind_${kind}` as TranslationKey);

  const depId = `${uid}-dep`;
  const taxId = `${uid}-tax`;
  const rateId = `${uid}-rate`;

  return (
    <PanelShell
      title={t("expert_tax_title")}
      description={t("expert_tax_desc", { currency: baseCurrency })}
      className={className}
      style={style}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <Switch id={depId} checked={depreciationView} onCheckedChange={setDepreciationView} aria-describedby={`${depId}-hint`} />
          <div className="space-y-0.5">
            <Label htmlFor={depId}>{t("expert_tax_depreciation_toggle")}</Label>
            <p id={`${depId}-hint`} className="text-xs text-muted-foreground">
              {t("expert_tax_depreciation_hint")}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Switch id={taxId} checked={applyTax} onCheckedChange={setApplyTax} aria-describedby={`${taxId}-hint`} />
          <div className="space-y-0.5">
            <Label htmlFor={taxId}>{t("expert_tax_estimate_toggle")}</Label>
            <p id={`${taxId}-hint`} className="text-xs text-muted-foreground">
              {t("expert_tax_estimate_hint")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor={rateId} className="text-sm">
          {t("expert_tax_rate")}
        </Label>
        <Input
          id={rateId}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.5}
          value={rateText}
          disabled={!applyTax}
          onChange={(e) => setRateText(e.target.value)}
          className="h-8 w-24 tabular-nums"
        />
      </div>

      {data.taxDepreciation.length === 0 ? (
        <EmptyNote>{t("expert_tax_empty")}</EmptyNote>
      ) : (
        <>
          <Scroller label={t("expert_tax_title")}>
            <thead>
              <TableRow className="hover:bg-transparent">
                {head("name", t("grid_col_name"))}
                {head("kind", t("expert_tax_col_kind"))}
                {head("cost", t("expert_tax_col_cost"), true)}
                {head("value", t("expert_tax_col_value"), true)}
                {head("gain", t("expert_tax_col_gain"), true)}
              </TableRow>
            </thead>
            <tbody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-48 truncate font-medium" title={r.name}>
                    {r.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{kindLabel(r.kind)}</TableCell>
                  <TableCell className={numCell}>{fmtMoney(r.costBasis)}</TableCell>
                  <TableCell className={numCell}>{fmtMoney(r.value)}</TableCell>
                  <TableCell className={cn(numCell, r.gain < 0 && "text-destructive")}>{fmtMoney(r.gain)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Scroller>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">{t("expert_tax_total_cost")}</dt>
            <dd className="text-end">{fmtMoney(summary.totalCost)}</dd>
            <dt className="text-muted-foreground">{t("expert_tax_total_value")}</dt>
            <dd className="text-end">{fmtMoney(summary.totalValue)}</dd>
            <dt className="text-muted-foreground">{t("expert_tax_net_gain")}</dt>
            <dd className={cn("text-end", summary.netUnrealisedGain < 0 && "text-destructive")}>{fmtMoney(summary.netUnrealisedGain)}</dd>
            {applyTax ? (
              <>
                <dt className="text-muted-foreground">{t("expert_tax_taxable")}</dt>
                <dd className="text-end">{fmtMoney(summary.taxableGain)}</dd>
                <dt className="font-medium">{t("expert_tax_estimated")}</dt>
                <dd className="text-end font-medium" aria-live="polite">
                  {fmtMoney(summary.estimatedTax)}
                </dd>
              </>
            ) : null}
          </dl>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t("expert_tax_disclaimer")}</p>
    </PanelShell>
  );
}

/* (iv) currency exposure heatmap */

function ExposurePanel({
  data,
  className,
  style,
  baseCurrency,
  fmtMoney,
  pct1,
}: {
  data: ExpertPanelsData;
  className: string;
  style: PanelStyle;
  baseCurrency: string;
  fmtMoney: (n: number) => string;
  pct1: Intl.NumberFormat;
}) {
  const { t } = useLanguage();
  const { maskValue } = usePrivacy();
  const { currencies, categories, cells, maxCell } = data.exposure;

  const cellMap = useMemo(() => {
    const m = new Map<string, (typeof cells)[number]>();
    for (const c of cells) m.set(`${c.currency}\u0000${c.category}`, c);
    return m;
  }, [cells]);

  return (
    <PanelShell
      title={t("expert_fx_title")}
      description={t("expert_fx_desc", { currency: baseCurrency })}
      className={className}
      style={style}
    >
      {cells.length === 0 ? (
        <EmptyNote>{t("expert_fx_empty")}</EmptyNote>
      ) : (
        <Scroller label={t("expert_fx_title")}>
          <thead>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 z-10 bg-card text-xs uppercase tracking-wide text-muted-foreground">
                {t("expert_raw_col_currency")}
              </TableHead>
              {categories.map((c) => (
                <TableHead key={c} className="sticky top-0 z-10 bg-card text-end text-xs uppercase tracking-wide text-muted-foreground">
                  {c}
                </TableHead>
              ))}
              <TableHead className="sticky top-0 z-10 bg-card text-end text-xs uppercase tracking-wide text-muted-foreground">
                {t("expert_fx_total")}
              </TableHead>
            </TableRow>
          </thead>
          <tbody>
            {currencies.map((cur) => (
              <TableRow key={cur.currency} className="hover:bg-transparent">
                <TableHead scope="row" className="whitespace-nowrap text-start font-medium">
                  {cur.currency}
                </TableHead>
                {categories.map((cat) => {
                  const cell = cellMap.get(`${cur.currency}\u0000${cat}`);
                  if (!cell) {
                    return (
                      <TableCell key={cat} className="text-end text-muted-foreground">
                        <span aria-hidden>-</span>
                      </TableCell>
                    );
                  }
                  // 10-65% of the chart colour: visible even for tiny cells, text stays readable at the top end.
                  const intensity = maxCell > 0 ? 10 + 55 * (cell.amount / maxCell) : 0;
                  const pct = pct1.format(cell.share);
                  return (
                    <TableCell
                      key={cat}
                      title={`${fmtMoney(cell.amount)}`}
                      aria-label={t("expert_fx_cell_label", { currency: cur.currency, category: cat, pct })}
                      className={cn(numCell, "font-medium text-foreground")}
                      style={{ backgroundColor: `color-mix(in oklab, var(--chart-1) ${intensity.toFixed(1)}%, transparent)` }}
                    >
                      {maskValue(`${pct}%`)}
                    </TableCell>
                  );
                })}
                <TableCell className={cn(numCell, "text-muted-foreground")}>{maskValue(`${pct1.format(cur.share)}%`)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Scroller>
      )}
    </PanelShell>
  );
}
