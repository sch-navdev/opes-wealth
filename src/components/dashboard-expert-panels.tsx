"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Info, Scale, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/tooltip";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useTierMotion } from "@/components/tier-gate";
import { DashboardAttributionPanel } from "@/components/dashboard-attribution-panel";
import type { AttributionPanelData } from "@/lib/dashboard-attribution";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { formatMultiple, formatPercent } from "@/lib/format-ratio";
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

/**
 * Scroll container: horizontal scroll on narrow screens, capped height so the sticky header works. The table is
 * the Expert "terminal" density: 12 px type, tight rows, a gold rule under the sticky header, faint zebra rows and a
 * warm hover row; figures use the mono face (tabular, so columns line up like a ticker tape).
 */
function Scroller({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-80 overflow-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className={TERMINAL_TABLE}>{children}</table>
    </div>
  );
}

const TERMINAL_TABLE = cn(
  "w-full caption-bottom text-xs tabular-nums",
  "[&_td]:px-2 [&_td]:py-1 [&_th]:h-8 [&_th]:px-2",
  "[&_thead_th]:border-b [&_thead_th]:border-primary/40",
  "[&_tbody_tr:nth-child(even)]:bg-muted/25 [&_tbody_tr:hover]:bg-primary/10",
);

const numCell = "text-end tabular-nums whitespace-nowrap font-mono";

/* ---------- panels ---------- */

type Props = { data: ExpertPanelsData; baseCurrency: string; attribution?: AttributionPanelData | null };

/** Number formatters shared by every Expert tile (money, multiples, IRR), already privacy-masked. */
function useExpertFormatters(baseCurrency: string) {
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();

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
  return { fmtMoney, fmtRatio, fmtIrr, pct1 };
}

const CARD = "animate-in fade-in slide-in-from-bottom-2 gap-4 border-border bg-card py-5 motion-reduce:animate-none min-w-0";

/**
 * The Expert tiles as separate blocks, so the customisable dashboard (lib/dashboard-layout.ts)
 * can order, hide and resize each one. `h-full` makes the card fill the block cell the layout
 * grid gives it. Entrance-animation indices match the former single-section order.
 */
type BlockProps = { data: ExpertPanelsData; baseCurrency: string };

export function ExpertRawBlock({ data, baseCurrency }: BlockProps) {
  const motion = useTierMotion();
  const { fmtMoney } = useExpertFormatters(baseCurrency);
  return (
    <RawDataPanel data={data} className={cn(CARD, "h-full")} style={tileEntranceStyle(motion, 0)} baseCurrency={baseCurrency} fmtMoney={fmtMoney} />
  );
}

export function ExpertPrivateEquityBlock({ data, baseCurrency }: BlockProps) {
  const motion = useTierMotion();
  const { fmtMoney, fmtRatio, fmtIrr } = useExpertFormatters(baseCurrency);
  return (
    <PrivateEquityPanel
      data={data}
      className={cn(CARD, "h-full")}
      style={tileEntranceStyle(motion, 1)}
      baseCurrency={baseCurrency}
      fmtMoney={fmtMoney}
      fmtRatio={fmtRatio}
      fmtIrr={fmtIrr}
    />
  );
}

export function ExpertTaxBlock({ data, baseCurrency }: BlockProps) {
  const motion = useTierMotion();
  const { fmtMoney } = useExpertFormatters(baseCurrency);
  return (
    <TaxPanel data={data} className={cn(CARD, "h-full")} style={tileEntranceStyle(motion, 2)} baseCurrency={baseCurrency} fmtMoney={fmtMoney} />
  );
}

export function ExpertExposureBlock({ data, baseCurrency }: BlockProps) {
  const motion = useTierMotion();
  const { fmtMoney, pct1 } = useExpertFormatters(baseCurrency);
  return (
    <ExposurePanel
      data={data}
      className={cn(CARD, "h-full")}
      style={tileEntranceStyle(motion, 3)}
      baseCurrency={baseCurrency}
      fmtMoney={fmtMoney}
      pct1={pct1}
    />
  );
}

export function ExpertRatiosBlock({ data, baseCurrency }: BlockProps) {
  const motion = useTierMotion();
  const { fmtMoney } = useExpertFormatters(baseCurrency);
  return (
    <RatiosPanel data={data} className={cn(CARD, "h-full")} style={tileEntranceStyle(motion, 4)} baseCurrency={baseCurrency} fmtMoney={fmtMoney} />
  );
}

export function ExpertAttributionBlock({ attribution, baseCurrency }: { attribution: AttributionPanelData; baseCurrency: string }) {
  const motion = useTierMotion();
  return (
    <DashboardAttributionPanel data={attribution} baseCurrency={baseCurrency} className={cn(CARD, "h-full")} style={tileEntranceStyle(motion, 5)} />
  );
}

/** All Expert tiles in one fixed two-column section (the arrangement before the dashboard became customisable). */
export function DashboardExpertPanels({ data, baseCurrency, attribution }: Props) {
  const { t } = useLanguage();
  return (
    <section aria-label={t("expert_raw_title")} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ExpertRawBlock data={data} baseCurrency={baseCurrency} />
      <ExpertPrivateEquityBlock data={data} baseCurrency={baseCurrency} />
      <ExpertTaxBlock data={data} baseCurrency={baseCurrency} />
      <ExpertExposureBlock data={data} baseCurrency={baseCurrency} />
      <div className="xl:col-span-2">
        <ExpertRatiosBlock data={data} baseCurrency={baseCurrency} />
      </div>
      {attribution ? (
        <div className="xl:col-span-2">
          <ExpertAttributionBlock attribution={attribution} baseCurrency={baseCurrency} />
        </div>
      ) : null}
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

/* (v) financial ratios */

/** Gauge caps: the bar is full at this value (a drawing scale only, not a benchmark). */
const ROA_CAP = 0.1;
const ROIC_CAP = 0.15;
const DE_CAP = 3;

type DeBand = "low" | "mid" | "high";
function deBand(n: number): DeBand {
  return n < 0.5 ? "low" : n <= 1.5 ? "mid" : "high";
}

function Gauge({ value, cap }: { value: number | null; cap: number }) {
  const width = value == null ? 0 : Math.min(1, Math.max(0, value / cap)) * 100;
  return (
    <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function RatiosPanel({
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
  const { roa, debtToEquity, roic, totals } = data.ratios;

  // Privacy Mode masks the ratio values too (as before); an unavailable ratio stays an en dash.
  const mask = (text: string, isNull: boolean) => (isNull ? text : maskValue(text));

  const stats: {
    id: string;
    Icon: LucideIcon;
    name: string;
    formula: string;
    def: string;
    value: string;
    isNull: boolean;
    raw: number | null;
    cap: number;
    capText: string;
    amounts: [string, number][];
    hint?: string;
    band?: string;
  }[] = [
    {
      id: "roa",
      Icon: TrendingUp,
      name: t("expert_ratios_roa"),
      formula: t("expert_ratios_roa_formula"),
      def: t("expert_ratios_roa_def"),
      value: mask(formatPercent(roa, intlLocale), roa == null),
      isNull: roa == null,
      raw: roa,
      cap: ROA_CAP,
      capText: formatPercent(ROA_CAP, intlLocale),
      amounts: [
        [t("expert_ratios_yield"), totals.annualYield],
        [t("expert_ratios_assets"), totals.totalAssets],
      ],
    },
    {
      id: "de",
      Icon: Scale,
      name: t("expert_ratios_de"),
      formula: t("expert_ratios_de_formula"),
      def: t("expert_ratios_de_def"),
      value: mask(formatMultiple(debtToEquity, intlLocale), debtToEquity == null),
      isNull: debtToEquity == null,
      raw: debtToEquity,
      cap: DE_CAP,
      capText: `${DE_CAP}x`,
      hint: t("expert_ratios_de_hint"),
      band: debtToEquity == null ? undefined : t(`expert_ratios_de_band_${deBand(debtToEquity)}` as TranslationKey),
      amounts: [
        [t("expert_ratios_liabilities"), totals.totalLiabilities],
        [t("expert_ratios_net_worth"), totals.netWorth],
      ],
    },
    {
      id: "roic",
      Icon: Target,
      name: t("expert_ratios_roic"),
      formula: t("expert_ratios_roic_formula"),
      def: t("expert_ratios_roic_def"),
      value: mask(formatPercent(roic, intlLocale), roic == null),
      isNull: roic == null,
      raw: roic,
      cap: ROIC_CAP,
      capText: formatPercent(ROIC_CAP, intlLocale),
      amounts: [
        [t("expert_ratios_yield"), totals.annualYield],
        [t("expert_ratios_assets"), totals.totalAssets],
        [t("expert_ratios_cash"), totals.cashAssets],
        [t("expert_ratios_other_liabilities"), totals.otherLiabilities],
        [t("expert_ratios_invested"), totals.investedCapital],
      ],
    },
  ];

  return (
    <PanelShell
      title={t("expert_ratios_title")}
      description={t("expert_ratios_desc", { currency: baseCurrency })}
      className={className}
      style={style}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <section
            key={s.id}
            aria-label={s.name}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background/40 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary">
                  <s.Icon className="size-4" aria-hidden />
                </span>
                <h3 className="min-w-0 pt-0.5 text-sm font-medium leading-snug text-muted-foreground">{s.name}</h3>
              </div>
              <InfoTooltip label={t("expert_ratios_info", { name: s.name })} icon={<Info className="size-4" aria-hidden />}>
                <span className="block font-medium text-foreground">{s.formula}</span>
                <span className="mt-1 block text-muted-foreground">{s.def}</span>
                {s.hint ? <span className="mt-1 block text-muted-foreground">{s.hint}</span> : null}
                <span className="mt-2 block space-y-0.5 tabular-nums">
                  {s.amounts.map(([label, amount]) => (
                    <span key={label} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={cn(amount < 0 && "text-destructive")}>{fmtMoney(amount)}</span>
                    </span>
                  ))}
                </span>
                <span className="mt-2 block text-muted-foreground">{t("expert_ratios_scale", { max: s.capText })}</span>
              </InfoTooltip>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="text-3xl font-semibold tabular-nums" aria-label={s.isNull ? t("expert_ratios_na") : undefined}>
                {s.value}
              </p>
              {s.band ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {s.band}
                </span>
              ) : null}
            </div>

            <div className="space-y-1">
              <Gauge value={s.raw} cap={s.cap} />
              <div aria-hidden className="flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>0</span>
                <span>{s.capText}</span>
              </div>
            </div>

            <p className="break-words text-xs text-muted-foreground">{s.formula}</p>

            <dl className="mt-auto grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-3 text-xs tabular-nums">
              {s.amounts.map(([label, amount]) => (
                <div key={label} className="contents">
                  <dt className="min-w-0 text-muted-foreground">{label}</dt>
                  <dd className={cn("text-end", amount < 0 && "text-destructive")}>{fmtMoney(amount)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("expert_ratios_note")}</p>
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
