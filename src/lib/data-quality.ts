/**
 * Data quality: flags data that silently makes totals or performance wrong (a currency the rate
 * table does not know, a valuation nobody has refreshed in months, a property with no purchase
 * price...). A reporting aid only: it never changes data and its wording never advises.
 *
 * Pure: no React, no I/O, never throws (malformed metadata is treated as "nothing recorded").
 * Input is what the dashboard already loads: the SHARE-SCALED asset rows (co-ownership applied),
 * the raw `asset_history` rows grouped per asset (also share-scaled; NOT the vehicle series that
 * `buildVehicleHistoryFromPurchase` carries flat to today, which would hide a stale valuation),
 * the FX rate table and where it came from, the base currency and today's ISO date.
 *
 * Every threshold lives in `DATA_QUALITY_CONFIG` below.
 */
import type { FxSource } from "@/lib/fx";
import { isClosedPosition, parseEquityMetadata } from "@/lib/equities";
import { parseCryptoMetadata } from "@/lib/crypto";
import { parsePreciousMetalMetadata } from "@/lib/precious-metals";
import { parseCompanyMetadata } from "@/lib/companies";
import { parseVehicleMetadata } from "@/lib/vehicles";
import { parseRealEstateMetadata } from "@/lib/real-estate";
import { parsePrivateEquityMetadata } from "@/lib/private-equity";
import { parseStartupMetadata } from "@/lib/startups";
import { parseExoticMetadata } from "@/lib/exotic-assets";

/* ---------- types ---------- */

export type DataQualitySeverity = "high" | "medium" | "low";

export const DATA_QUALITY_SEVERITIES: readonly DataQualitySeverity[] = ["high", "medium", "low"];

/** Every check, in display order (filter chips, tie-breaks). */
export const DATA_QUALITY_KINDS = [
  "fx_missing",
  "fx_fallback",
  "stale_valuation",
  "no_valuation_date",
  "missing_cost_basis",
  "cash_balance_mismatch",
  "zero_value",
  "pe_overdue_call",
  "duplicate_suspect",
] as const;

export type DataQualityKind = (typeof DATA_QUALITY_KINDS)[number];

/** Values for the explanation text (`{placeholder}` -> value). Dates are ISO `YYYY-MM-DD`. */
export type DataQualityParams = Record<string, string | number>;

export type DataQualityIssue = {
  /** Stable and unique within a report: `<kind>:<asset id>`, or `<kind>:global` / `fx_missing:base`. */
  id: string;
  kind: DataQualityKind;
  severity: DataQualitySeverity;
  /** Absent for global issues (they concern every asset, e.g. approximate FX rates). */
  assetId?: string;
  assetName?: string;
  category?: string;
  params: DataQualityParams;
};

export type DataQualityCounts = {
  total: number;
  high: number;
  medium: number;
  low: number;
  byKind: Partial<Record<DataQualityKind, number>>;
};

export type DataQualityReport = { issues: DataQualityIssue[]; counts: DataQualityCounts };

/** The asset columns the checks read (a subset of the dashboard's `AssetRow`). */
export type DataQualityAsset = {
  id: string;
  name: string;
  currency: string;
  current_value: number;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  purchase_date: string | null;
  quantity: number;
  asset_categories: { name: string } | null;
};

export type DataQualityHistoryRow = { recorded_date: string; value: number };

export type DataQualityInput = {
  assets: readonly DataQualityAsset[];
  /** `asset_history` rows per asset id (any order; for equal dates the later row wins). */
  historyByAsset: ReadonlyMap<string, readonly DataQualityHistoryRow[]>;
  /** Base-anchored rate table, exactly what `convertAmount` is given. */
  rates: Readonly<Record<string, number>>;
  fxSource: FxSource;
  baseCurrency: string;
  /** ISO `YYYY-MM-DD`. When it is not a valid date the date-based checks are skipped. */
  today: string;
};

/* ---------- configuration ---------- */

export const DATA_QUALITY_CONFIG = {
  /** Days a valuation may age before it is reported, per category name (others: `defaultStaleDays`). */
  staleDays: {
    Equities: 7,
    Crypto: 7,
    "Precious Metals": 7,
    Cash: 45,
    "Private Equity": 180,
    SCPI: 180,
  } as Readonly<Record<string, number>>,
  /** Real Estate, Vehicles, Companies, Assurance-Vie, Startups, Exotic Assets and anything else. */
  defaultStaleDays: 365,
  /** A stale valuation is "medium" once older than this multiple of its threshold, else "low". */
  staleMediumFactor: 2,
  /** A Cash balance matches its latest history row within max(absolute, relative x the larger amount). */
  cashTolerance: { absolute: 1, relative: 0.005 },
  /** Fixed severities (the stale-valuation severity depends on the age, see above). */
  severity: {
    fx_missing: "high",
    fx_fallback: "medium",
    no_valuation_date: "low",
    missing_cost_basis: "low",
    cash_balance_mismatch: "medium",
    zero_value: "low",
    pe_overdue_call: "medium",
    duplicate_suspect: "low",
  } as const satisfies Record<Exclude<DataQualityKind, "stale_valuation">, DataQualitySeverity>,
} as const;

/** The valuation-age threshold of a category, in days. */
export function staleThresholdDays(category: string): number {
  const own = DATA_QUALITY_CONFIG.staleDays;
  return Object.prototype.hasOwnProperty.call(own, category) ? own[category] : DATA_QUALITY_CONFIG.defaultStaleDays;
}

/* ---------- small pure helpers ---------- */

const DAY_MS = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

/**
 * Days since 1970-01-01 (UTC) of an ISO date `YYYY-MM-DD`, or of the date part of an ISO
 * timestamp (`last_priced_at` is stored as one). Null for anything else, including impossible
 * calendar dates such as 2023-02-29.
 */
export function isoDayNumber(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = ISO_DAY.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const time = Date.UTC(y, m - 1, d);
  const date = new Date(time);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return Math.round(time / DAY_MS);
}

function isoFromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** A rate `convertAmount` can divide by: missing, zero, negative or non-numeric rates all mean 1:1 or worse. */
export function hasUsableRate(rates: Readonly<Record<string, number>>, currency: string): boolean {
  const rate = Object.prototype.hasOwnProperty.call(rates, currency) ? rates[currency] : undefined;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}

/** Number or numeric string -> number; anything else -> NaN. */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

const isPositive = (value: unknown) => toNumber(value) > 0;

/** Runs a metadata read; malformed metadata (a parser throwing) counts as "nothing recorded". */
function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/** Lower-cased, accents and punctuation removed, whitespace collapsed: "Villa  Émeraude!" -> "villa emeraude". */
export function normalizeAssetName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const categoryOf = (asset: DataQualityAsset) => asset.asset_categories?.name ?? "";

/** A fully sold equity line, kept only for its history and dividends. */
const isClosedEquity = (asset: DataQualityAsset) =>
  categoryOf(asset) === "Equities" && isClosedPosition(asset.quantity);

/** Valuation dates a category records in its metadata (in addition to `asset_history`). */
function metadataValuationDates(category: string, metadata: unknown): unknown[] {
  return safe<unknown[]>(() => {
    switch (category) {
      case "Equities":
        return [parseEquityMetadata(metadata).last_priced_at];
      case "Crypto":
        return [parseCryptoMetadata(metadata).last_priced_at];
      case "Precious Metals":
        return [parsePreciousMetalMetadata(metadata).last_priced_at];
      case "Exotic Assets":
        return [parseExoticMetadata(metadata).last_priced_at];
      case "Companies":
        return [parseCompanyMetadata(metadata).valuation_date];
      case "Vehicles": {
        const md = parseVehicleMetadata(metadata);
        return [md.last_valuation_date, ...md.blue_book_log.map((entry) => entry?.date)];
      }
      case "Private Equity":
        return [parsePrivateEquityMetadata(metadata).nav_date];
      case "Startups":
        // The holding is valued at the latest funding round's price.
        return parseStartupMetadata(metadata).funding_rounds.map((round) => round?.date);
      default:
        return [];
    }
  }, []);
}

/** The newest history row with a valid date (the later row wins on equal dates). */
function latestHistoryRow(rows: readonly DataQualityHistoryRow[]): { day: number; value: number } | null {
  let latest: { day: number; value: number } | null = null;
  for (const row of rows) {
    const day = isoDayNumber(row?.recorded_date);
    if (day == null) continue;
    if (!latest || day >= latest.day) latest = { day, value: Number(row.value) };
  }
  return latest;
}

/** What tells two same-named holdings apart: the broker account, the bank account or the wallet. */
function duplicateDiscriminator(category: string, metadata: Record<string, unknown> | null): string {
  const md = metadata ?? {};
  const text = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");
  switch (category) {
    case "Equities":
      return text(md.account_id) || text(md.account_name);
    case "Cash":
      return `${text(md.institution_name)}|${text(md.account_ref)}`;
    case "Crypto":
      return `${text(md.exchange_name)}|${text(md.wallet_address)}`;
    default:
      return "";
  }
}

/* ---------- the checks ---------- */

const SEVERITY_RANK: Record<DataQualitySeverity, number> = { high: 0, medium: 1, low: 2 };
const KIND_RANK = Object.fromEntries(DATA_QUALITY_KINDS.map((kind, i) => [kind, i])) as Record<DataQualityKind, number>;

const compareText = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

/** Severity, then category (global issues first), then asset name; kind and id break ties. */
export function compareIssues(a: DataQualityIssue, b: DataQualityIssue): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    compareText(a.category ?? "", b.category ?? "") ||
    compareText(a.assetName ?? "", b.assetName ?? "") ||
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function countIssues(issues: readonly DataQualityIssue[]): DataQualityCounts {
  const counts: DataQualityCounts = { total: issues.length, high: 0, medium: 0, low: 0, byKind: {} };
  for (const issue of issues) {
    counts[issue.severity] += 1;
    counts.byKind[issue.kind] = (counts.byKind[issue.kind] ?? 0) + 1;
  }
  return counts;
}

/** Runs every check. Deterministic: the same input always gives the same issues in the same order. */
export function runDataQualityChecks(input: DataQualityInput): DataQualityReport {
  const cfg = DATA_QUALITY_CONFIG;
  const assets = input.assets ?? [];
  const rates = input.rates ?? {};
  const base = input.baseCurrency;
  const todayDay = isoDayNumber(input.today);
  const issues: DataQualityIssue[] = [];

  const assetIssue = (
    asset: DataQualityAsset,
    kind: DataQualityKind,
    severity: DataQualitySeverity,
    params: DataQualityParams = {},
  ) => {
    const category = categoryOf(asset);
    issues.push({
      id: `${kind}:${asset.id}`,
      kind,
      severity,
      assetId: asset.id,
      assetName: asset.name,
      ...(category ? { category } : {}),
      params,
    });
  };

  // FX: `convertAmount` silently treats an unknown currency as 1:1 against the base. Only assets
  // that are actually converted (currency differs from the base) are affected.
  const converted = assets.filter((a) => a.currency !== base);
  if (converted.length > 0 && !hasUsableRate(rates, base)) {
    issues.push({ id: "fx_missing:base", kind: "fx_missing", severity: cfg.severity.fx_missing, params: { currency: base, scope: "base" } });
  }
  if (converted.length > 0 && input.fxSource === "fallback") {
    issues.push({ id: "fx_fallback:global", kind: "fx_fallback", severity: cfg.severity.fx_fallback, params: {} });
  }

  for (const asset of assets) {
    const category = categoryOf(asset);
    // A closed position or a closed bank account (a statement printed its closure date) is history only.
    const closedEquity = isClosedEquity(asset) || typeof asset.metadata?.closed_on === "string";

    if (asset.currency !== base && !hasUsableRate(rates, asset.currency)) {
      assetIssue(asset, "fx_missing", cfg.severity.fx_missing, { currency: asset.currency, base });
    }

    // Everything below concerns holdings: debts carry no valuation date, cost basis or capital call.
    if (asset.is_liability) continue;

    const history = input.historyByAsset.get(asset.id) ?? [];

    // Valuation age (closed equity positions are history only).
    if (!closedEquity) {
      const latest = latestHistoryRow(history);
      let lastDay = latest?.day ?? null;
      for (const raw of metadataValuationDates(category, asset.metadata)) {
        const day = isoDayNumber(raw);
        if (day != null && (lastDay == null || day > lastDay)) lastDay = day;
      }
      if (lastDay == null) {
        assetIssue(asset, "no_valuation_date", cfg.severity.no_valuation_date);
      } else if (todayDay != null) {
        const days = Math.max(0, todayDay - lastDay);
        const threshold = staleThresholdDays(category);
        if (days > threshold) {
          assetIssue(asset, "stale_valuation", days > threshold * cfg.staleMediumFactor ? "medium" : "low", {
            days,
            threshold,
            date: isoFromDayNumber(lastDay),
          });
        }
      }
    }

    // Cost basis: without it gain and performance cannot be computed.
    if (category === "Real Estate") {
      const md = safe(() => parseRealEstateMetadata(asset.metadata), null);
      if (!md || (!isPositive(md.contract_price) && !isPositive(md.purchasePrice))) {
        assetIssue(asset, "missing_cost_basis", cfg.severity.missing_cost_basis, { basis: "purchase_price" });
      }
    } else if (category === "Vehicles") {
      const md = safe(() => parseVehicleMetadata(asset.metadata), null);
      if (!md || !isPositive(md.purchase_price)) {
        assetIssue(asset, "missing_cost_basis", cfg.severity.missing_cost_basis, { basis: "purchase_price" });
      }
    } else if (category === "Equities" && !closedEquity) {
      const trades = safe(() => parseEquityMetadata(asset.metadata).trades, []);
      if (!trades.some((t) => t?.side === "buy")) {
        assetIssue(asset, "missing_cost_basis", cfg.severity.missing_cost_basis, { basis: "trades" });
      }
    }

    // Cash: the balance shown should be the latest balance on record.
    if (category === "Cash") {
      const latest = latestHistoryRow(history);
      const current = toNumber(asset.current_value);
      if (latest && Number.isFinite(latest.value) && Number.isFinite(current)) {
        const tolerance = Math.max(
          cfg.cashTolerance.absolute,
          cfg.cashTolerance.relative * Math.max(Math.abs(current), Math.abs(latest.value)),
        );
        if (Math.abs(current - latest.value) > tolerance) {
          assetIssue(asset, "cash_balance_mismatch", cfg.severity.cash_balance_mismatch, {
            current,
            recorded: latest.value,
            date: isoFromDayNumber(latest.day),
            currency: asset.currency,
          });
        }
      }
    }

    if (!closedEquity && !(toNumber(asset.current_value) > 0)) {
      assetIssue(asset, "zero_value", cfg.severity.zero_value);
    }

    // Private equity: a pending call past its due date is still counted as an unpaid obligation.
    if (category === "Private Equity" && todayDay != null) {
      const calls = safe(() => parsePrivateEquityMetadata(asset.metadata).capital_calls, []);
      let count = 0;
      let earliest: number | null = null;
      for (const call of calls) {
        if (call?.status !== "pending") continue;
        const due = isoDayNumber(call.due_date);
        if (due == null || due >= todayDay) continue;
        count += 1;
        if (earliest == null || due < earliest) earliest = due;
      }
      if (count > 0 && earliest != null) {
        assetIssue(asset, "pe_overdue_call", cfg.severity.pe_overdue_call, { count, date: isoFromDayNumber(earliest) });
      }
    }
  }

  // Possible duplicates: same normalised name, category, currency (and account / bank / wallet).
  const groups = new Map<string, DataQualityAsset[]>();
  for (const asset of assets) {
    if (isClosedEquity(asset)) continue;
    const name = normalizeAssetName(asset.name);
    if (!name) continue;
    const category = categoryOf(asset);
    const key = [name, category, asset.currency, duplicateDiscriminator(category, asset.metadata)].join("\u0000");
    const group = groups.get(key);
    if (group) group.push(asset);
    else groups.set(key, [asset]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const asset of group) {
      assetIssue(asset, "duplicate_suspect", cfg.severity.duplicate_suspect, { count: group.length });
    }
  }

  issues.sort(compareIssues);
  return { issues, counts: countIssues(issues) };
}
