"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateTotalCost,
  calculateUnrealizedGain,
  EMPTY_REAL_ESTATE_METADATA,
  nextPropertyExpenseId,
  nextTenancyContractId,
  parseRealEstateMetadata,
  resolveOutstandingLoanBalance,
  sumAcquisitionFees,
  type PropertyExpense,
  type RealEstateMetadata,
  type TenancyContract,
} from "@/lib/real-estate";
import { canAmortize, getOutstandingPrincipalAt } from "@/lib/amortization";
import {
  hasAnyExtractedField,
  parseTenancyContract,
  type ParsedTenancyContract,
} from "@/lib/tenancy-parser";
import type { VehicleValuationErrorCode } from "@/lib/services/vehicle-valuation-client";
import {
  getOqoodProjectStatus,
  getSmartValuation,
  type DldErrorCode,
} from "@/lib/services/dld-client";
import {
  getOffPlanProjectTracking,
  getReadyBuiltValuation,
  fetchAdrecValuation,
  type AdrecErrorCode,
  type AdrecValuationData,
} from "@/lib/services/adrec-client";
import type { AssetHistorySource } from "@/lib/asset-history";
import type { ParsedBankCsvRow } from "@/lib/bank-csv";
import {
  buildInvestedCapitalSeries,
  estimateCostBasisUnitPrice,
  type EquityIncome,
  normalizeExchange,
  parseEquityMetadata,
  type EquityTrade,
} from "@/lib/equities";
import { tradeId } from "@/lib/parsers/broker-registry";
import type { AggregatedHolding, ParsedIncome } from "@/lib/parsers/types";
import { convertAmount, getExchangeRatesFromUsd } from "@/lib/fx";
import { estimateOffplanValueAt } from "@/lib/real-estate-analytics";
import {
  hasAnyExtractedField as hasAnyPropertyDocumentField,
  parsePropertyDocument,
  toRealEstateMetadataPatch,
  type PropertyDocumentType,
} from "@/lib/property-document-parser";
import type { Json } from "@/types/supabase";

function parseImages(formData: FormData): string[] {
  const raw = formData.get("images") as string | null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Auto-generates the `asset_history` timeline for an asset whenever it's
 * created or updated: a starting point on the earliest payment milestone's
 * due date (for off-plan Real Estate, the down payment milestone), one
 * point per "paid" milestone with the cumulative paid-to-date amount up to
 * that date, and one "current snapshot" point. That snapshot uses
 * `explicitDate` when given — `addAsset` passes the user's Purchase Date so
 * a freshly created asset's curve starts there instead of at row-creation
 * time — and otherwise falls back to today, which is what `updateAsset`
 * relies on (editing an asset always re-stamps today's snapshot; it never
 * moves the original purchase point). Since there's no recorded historical
 * market valuation at each past milestone date, those historical points use
 * cumulative cash invested (paid milestones + fees) for both `value` and
 * `net_equity` — a deliberate simplification flagged in the tracker notes,
 * not a claim that net equity equals cash invested in general. Upserts on
 * (asset_id, recorded_date) so re-saving the form regenerates the same
 * points instead of duplicating them.
 */
async function syncAssetHistory(
  supabase: SupabaseClient,
  assetId: string,
  currentValue: number,
  categoryName: string | null | undefined,
  metadata: Json,
  explicitDate?: string,
) {
  const snapshotDate = explicitDate || new Date().toISOString().slice(0, 10);
  const points = new Map<
    string,
    { asset_id: string; recorded_date: string; value: number; net_equity: number; source: "manual" }
  >();

  function addPoint(date: string, value: number, netEquity: number) {
    if (!date) return;
    points.set(date, {
      asset_id: assetId,
      recorded_date: date,
      value,
      net_equity: netEquity,
      source: "manual",
    });
  }

  const isRealEstate = categoryName === "Real Estate";

  if (isRealEstate) {
    const re = parseRealEstateMetadata(metadata);
    const totalFees = sumAcquisitionFees(re);

    const sortedMilestones = re.payment_schedule
      .filter((m) => m.due_date)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));

    const marketValuation = re.market_valuation ?? currentValue;

    if (sortedMilestones.length > 0 && re.is_offplan) {
      // Off-plan: the log must reflect the unit's estimated MARKET value on
      // each milestone date (contract price drifting toward today's
      // valuation), not the installments paid. Equity is that value minus
      // what is still owed to the developer at that point.
      const contractPrice = re.contract_price ?? re.purchasePrice ?? marketValuation;
      const startDate = sortedMilestones[0].due_date;
      const valueAt = (date: string) =>
        estimateOffplanValueAt({
          contractPrice,
          startDate,
          currentMarketValue: marketValuation,
          snapshotDate,
          date,
        });

      let cumulativePaid = sortedMilestones[0].status === "paid" ? 0 : sortedMilestones[0].amount;
      for (const milestone of sortedMilestones) {
        if (milestone.status === "paid") cumulativePaid += milestone.amount;
        if (milestone.status === "paid" || milestone === sortedMilestones[0]) {
          const value = valueAt(milestone.due_date);
          addPoint(milestone.due_date, value, value - Math.max(0, contractPrice - cumulativePaid));
        }
      }
    } else if (sortedMilestones.length > 0) {
      const first = sortedMilestones[0];
      addPoint(first.due_date, first.amount + totalFees, first.amount + totalFees);

      let cumulativePaid = 0;
      for (const milestone of sortedMilestones) {
        if (milestone.status === "paid") {
          cumulativePaid += milestone.amount;
          const cumulativeWithFees = cumulativePaid + totalFees;
          addPoint(milestone.due_date, cumulativeWithFees, cumulativeWithFees);
        }
      }
    }

    addPoint(snapshotDate, marketValuation, currentValue);
  } else {
    addPoint(snapshotDate, currentValue, currentValue);
  }

  const rows = Array.from(points.values());
  if (rows.length === 0) return;

  await supabase
    .from("asset_history")
    .upsert(rows, { onConflict: "asset_id,recorded_date" });
}

export async function addAsset(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to add an asset." };
  }

  const name = formData.get("name") as string;
  const categoryId = formData.get("category_id") as string;
  const quantity = formData.get("quantity") as string;
  const currentValue = formData.get("current_value") as string;
  const currency = (formData.get("currency") as string) || "USD";
  const images = parseImages(formData);
  const tickerSymbol = (formData.get("ticker_symbol") as string | null) || null;
  const purchaseDate = formData.get("purchase_date") as string;

  const metadataRaw = formData.get("metadata") as string | null;
  let metadata: Json = {};
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      return { error: "Invalid metadata payload." };
    }
  }

  const { data: inserted, error } = await supabase
    .from("assets")
    .insert({
      profile_id: user.id,
      category_id: categoryId,
      name,
      quantity: quantity ? Number(quantity) : 1,
      current_value: Number(currentValue),
      currency,
      metadata,
      images,
      ticker_symbol: tickerSymbol,
      purchase_date: purchaseDate,
    })
    .select("id, asset_categories(name)")
    .single<{ id: string; asset_categories: { name: string } | null }>();

  if (error) {
    return { error: error.message };
  }

  await syncAssetHistory(
    supabase,
    inserted.id,
    Number(currentValue),
    inserted.asset_categories?.name,
    metadata,
    purchaseDate,
  );

  revalidatePath("/dashboard");
}

export async function updateAsset(id: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to update an asset." };
  }

  const name = formData.get("name") as string;
  const categoryId = formData.get("category_id") as string;
  const quantity = formData.get("quantity") as string;
  const currentValue = formData.get("current_value") as string;
  const currency = (formData.get("currency") as string) || "USD";
  const images = parseImages(formData);
  const tickerSymbol = (formData.get("ticker_symbol") as string | null) || null;
  const purchaseDate = formData.get("purchase_date") as string;

  const metadataRaw = formData.get("metadata") as string | null;
  let metadata: Json = {};
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      return { error: "Invalid metadata payload." };
    }
  }

  const { data: updated, error } = await supabase
    .from("assets")
    .update({
      category_id: categoryId,
      name,
      quantity: quantity ? Number(quantity) : 1,
      current_value: Number(currentValue),
      currency,
      metadata,
      images,
      ticker_symbol: tickerSymbol,
      purchase_date: purchaseDate,
    })
    .eq("id", id)
    .eq("profile_id", user.id)
    .select("id, asset_categories(name)")
    .single<{ id: string; asset_categories: { name: string } | null }>();

  if (error) {
    return { error: error.message };
  }

  await syncAssetHistory(
    supabase,
    updated.id,
    Number(currentValue),
    updated.asset_categories?.name,
    metadata,
  );

  revalidatePath("/dashboard", "layout");
}

/**
 * Records a new valuation for a manual (non-live-priced) asset. `date`
 * defaults to today, but the Refresh Valuation dialog lets the user pick a
 * past date to back-populate the history curve — when they do, this only
 * inserts the `asset_history` point for that date; it deliberately does
 * NOT touch `assets.current_value`/`metadata`, since backdating adds a
 * historical data point rather than redefining what the asset is worth
 * right now. Only a same-day (today) valuation updates the live figures,
 * exactly as this action always behaved before the date picker existed.
 */
export async function updateAssetValuation(
  id: string,
  newValue: number,
  source: AssetHistorySource,
  date?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to update a valuation." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      metadata: Json | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset) {
    return { error: "Asset not found." };
  }

  const isRealEstate = asset.asset_categories?.name === "Real Estate";
  const recordedDate = date || new Date().toISOString().slice(0, 10);
  const isToday = recordedDate === new Date().toISOString().slice(0, 10);

  let netEquity = newValue;
  let nextMetadata = asset.metadata;

  if (isRealEstate) {
    const reMetadata = parseRealEstateMetadata(asset.metadata);
    // Equity = current market value − outstanding loan balance. The loan
    // balance itself prefers the amortization engine's exact point-in-time
    // figure (`lib/amortization.ts`) over the manually-entered
    // `outstanding_principal`, whenever the loan has enough data to run it.
    const loanPrincipal = canAmortize(reMetadata.linked_loan)
      ? getOutstandingPrincipalAt(reMetadata.linked_loan, recordedDate)
      : resolveOutstandingLoanBalance(reMetadata.linked_loan);
    const outstandingOffplan = reMetadata.is_offplan
      ? reMetadata.outstanding_balance
      : 0;

    netEquity = newValue - outstandingOffplan - loanPrincipal;
    nextMetadata = { ...reMetadata, market_valuation: newValue };
  }

  if (isToday) {
    const { error: updateError } = await supabase
      .from("assets")
      .update({ current_value: netEquity, metadata: nextMetadata })
      .eq("id", id)
      .eq("profile_id", user.id);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  const { error: historyError } = await supabase.from("asset_history").upsert(
    {
      asset_id: id,
      recorded_date: recordedDate,
      value: newValue,
      net_equity: netEquity,
      source,
    },
    { onConflict: "asset_id,recorded_date" },
  );

  if (historyError) {
    return { error: historyError.message };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${id}`);
}

/**
 * Dubai Land Department / RERA integration (`lib/services/dld-client.ts`,
 * `tracker/Market-Data-Integration.md`) — dispatches to whichever DLD
 * subsystem matches the asset's `is_offplan` flag:
 *
 * - **Ready-built**: the Smart Valuation API returns a monetary
 *   `ai_valuation_amount`, so this reuses `updateAssetValuation` (same
 *   persistence path as the DARI/manual flows: Net Equity recomputed via
 *   `resolveOutstandingLoanBalance`, `assets.current_value`/
 *   `metadata.market_valuation` updated, an `asset_history` row upserted).
 *   `calculateTotalCost`/`calculateUnrealizedGain` are then used to hand
 *   back an immediate cost-basis/gain figure for the UI, without waiting on
 *   a full page reload.
 * - **Off-plan**: the Oqood & TAS Project Status API returns no monetary
 *   figure at all (only completion %, escrow status, latest inspection
 *   date) — it would be dishonest to invent a valuation from those, so this
 *   branch writes them into `metadata` instead and deliberately leaves
 *   `current_value`/`asset_history` untouched.
 */
export type RefreshDldValuationResult =
  | {
      ok: true;
      kind: "valuation";
      isMock: boolean;
      /** False when the payload was sample data: returned for display only, nothing was written. */
      persisted: boolean;
      value: number;
      certificateReference: string;
      unrealizedGainAmount: number;
    }
  | {
      ok: true;
      kind: "project_status";
      isMock: boolean;
      persisted: boolean;
      completionPercentage: number;
    }
  | { ok: false; code?: DldErrorCode; error: string };

export async function refreshDldValuation(id: string): Promise<RefreshDldValuationResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to refresh a valuation." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      metadata: Json | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset) {
    return { ok: false, error: "Asset not found." };
  }

  if (asset.asset_categories?.name !== "Real Estate") {
    return {
      ok: false,
      error: "Dubai Land Department refresh is only available for Real Estate assets.",
    };
  }

  const metadata = parseRealEstateMetadata(asset.metadata);

  if (metadata.emirate === "abu_dhabi") {
    return {
      ok: false,
      error: "This property is registered in Abu Dhabi — use the ADREC/DARI refresh instead.",
    };
  }

  if (metadata.is_offplan) {
    const result = await getOqoodProjectStatus({
      oqoodContractNumber: metadata.oqood_number || undefined,
      projectNumber: metadata.project_number || undefined,
      escrowId: metadata.escrow_id || undefined,
    });

    if (!result.ok) {
      return { ok: false, code: result.code, error: result.error };
    }

    // Sample data is read-only: show it, never persist it.
    if (!result.isMock) {
      const nextMetadata = {
        ...metadata,
        completion_percentage: result.completion_percentage,
        escrow_balance_status: result.escrow_balance_status,
        latest_inspection_date: result.latest_inspection_date,
      };

      const { error: updateError } = await supabase
        .from("assets")
        .update({ metadata: nextMetadata })
        .eq("id", id)
        .eq("profile_id", user.id);

      if (updateError) {
        return { ok: false, error: updateError.message };
      }

      revalidatePath("/dashboard", "layout");
      revalidatePath(`/dashboard/assets/${id}`);
    }

    return {
      ok: true,
      kind: "project_status",
      isMock: result.isMock,
      persisted: !result.isMock,
      completionPercentage: result.completion_percentage,
    };
  }

  const result = await getSmartValuation({
    titleDeedNumber: metadata.title_deed_number,
    plotId: metadata.plot_id,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.error };
  }

  // Sample (mock) valuations are read-only: returned for display/certificate
  // preview but NEVER written — updateAssetValuation would overwrite the
  // asset's current value/market valuation and insert an asset_history row
  // (the bug that skewed Ellington House's Net Profit).
  if (!result.isMock) {
    const updateResult = await updateAssetValuation(
      id,
      result.ai_valuation_amount,
      "dubailand",
      result.valuation_date,
    );

    if (updateResult?.error) {
      return { ok: false, error: updateResult.error };
    }
  }

  const totalCost = calculateTotalCost(metadata, result.ai_valuation_amount);
  const unrealizedGain = calculateUnrealizedGain(result.ai_valuation_amount, totalCost);

  return {
    ok: true,
    kind: "valuation",
    isMock: result.isMock,
    persisted: !result.isMock,
    value: result.ai_valuation_amount,
    certificateReference: result.certificate_reference,
    unrealizedGainAmount: unrealizedGain.amount,
  };
}

export type RefreshAdrecValuationResult =
  | {
      ok: true;
      kind: "valuation";
      isMock: boolean;
      /** False when the payload was sample data: returned for display only, nothing was written. */
      persisted: boolean;
      value: number;
      certificateId: string;
      unrealizedGainAmount: number;
    }
  | {
      ok: true;
      kind: "project_status";
      isMock: boolean;
      persisted: boolean;
      completionRate: number;
    }
  | { ok: false; code?: AdrecErrorCode; error: string };

/**
 * Abu Dhabi Real Estate Centre (ADREC) / DARI integration
 * (`lib/services/adrec-client.ts`, `tracker/Market-Data-Integration.md`) —
 * follows the exact pattern established by `refreshDldValuation` above,
 * dispatching on the asset's `is_offplan` flag:
 *
 * - **Ready-built**: the DARI Certificates API returns a monetary
 *   `officialValuationAmount`, so this reuses `updateAssetValuation` (Net
 *   Equity recomputed via `resolveOutstandingLoanBalance`,
 *   `assets.current_value`/`metadata.market_valuation` updated, an
 *   `asset_history` row upserted tagged `"dari"`), then uses
 *   `calculateTotalCost`/`calculateUnrealizedGain` for an immediate
 *   cost-basis/gain figure.
 * - **Off-plan**: the ADREC Projects & Escrow API returns no monetary
 *   figure (only completion rate, escrow status, construction stage,
 *   inspection date) — same rationale as `refreshDldValuation`'s off-plan
 *   branch, this writes those into `metadata` and deliberately leaves
 *   `current_value`/`asset_history` untouched rather than fabricating a
 *   valuation from a completion percentage.
 */
export async function refreshAdrecValuation(id: string): Promise<RefreshAdrecValuationResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to refresh a valuation." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      metadata: Json | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset) {
    return { ok: false, error: "Asset not found." };
  }

  if (asset.asset_categories?.name !== "Real Estate") {
    return {
      ok: false,
      error: "ADREC/DARI refresh is only available for Real Estate assets.",
    };
  }

  const metadata = parseRealEstateMetadata(asset.metadata);

  if (metadata.emirate !== "abu_dhabi") {
    return {
      ok: false,
      error: "This property is registered in Dubai — use the DLD/RERA refresh instead.",
    };
  }

  if (metadata.is_offplan) {
    const result = await getOffPlanProjectTracking({
      projectId: metadata.adrec_project_id,
      developerId: metadata.adrec_developer_id,
    });

    if (!result.ok) {
      return { ok: false, code: result.code, error: result.error };
    }

    // Sample data is read-only: show it, never persist it.
    if (!result.isMock) {
      const nextMetadata = {
        ...metadata,
        adrec_completion_rate: result.projectCompletionRate,
        adrec_escrow_status: result.escrowStatus,
        adrec_construction_stage: result.constructionStage,
        adrec_inspection_date: result.latestInspectionDate,
      };

      const { error: updateError } = await supabase
        .from("assets")
        .update({ metadata: nextMetadata })
        .eq("id", id)
        .eq("profile_id", user.id);

      if (updateError) {
        return { ok: false, error: updateError.message };
      }

      revalidatePath("/dashboard", "layout");
      revalidatePath(`/dashboard/assets/${id}`);
    }

    return {
      ok: true,
      kind: "project_status",
      isMock: result.isMock,
      persisted: !result.isMock,
      completionRate: result.projectCompletionRate,
    };
  }

  const result = await getReadyBuiltValuation({
    plotNumber: metadata.adrec_plot_number,
    unitId: metadata.adrec_unit_id,
    titleDeedNumber: metadata.adrec_title_deed,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, error: result.error };
  }

  // Sample (mock) valuations are read-only — never written (see the DLD
  // branch in refreshDldValuation for why).
  if (!result.isMock) {
    const updateResult = await updateAssetValuation(
      id,
      result.officialValuationAmount,
      "dari",
      result.valuationDate,
    );

    if (updateResult?.error) {
      return { ok: false, error: updateResult.error };
    }
  }

  const totalCost = calculateTotalCost(metadata, result.officialValuationAmount);
  const unrealizedGain = calculateUnrealizedGain(result.officialValuationAmount, totalCost);

  return {
    ok: true,
    kind: "valuation",
    isMock: result.isMock,
    persisted: !result.isMock,
    value: result.officialValuationAmount,
    certificateId: result.certificateId,
    unrealizedGainAmount: unrealizedGain.amount,
  };
}

export type ParsePropertyDocumentResult =
  | {
      ok: true;
      documentType: PropertyDocumentType;
      patch: Partial<RealEstateMetadata>;
      /** Patch entries flattened for the confirmation preview. */
      fields: { key: string; value: string }[];
    }
  | { ok: false; error: string };

/**
 * Step 1 of the UAE property-document import: reads an uploaded PDF (Abu
 * Dhabi off-plan SPA / title deed, Dubai title deed / Form F / Oqood / DLD
 * receipt — `lib/property-document-parser.ts`), auto-detects which it is,
 * and returns the fields it would write into the asset's existing
 * `RealEstateMetadata` jsonb. Writes nothing — the user confirms the preview
 * first, then `applyPropertyDocumentPatch` persists.
 */
export async function parsePropertyDocumentFile(
  formData: FormData,
): Promise<ParsePropertyDocumentResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to import a document." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file was uploaded." };
  }

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default;
    text = (await pdfParse(buffer)).text;
  } catch {
    return { ok: false, error: "Could not read this PDF file." };
  }

  const parsed = parsePropertyDocument(text);
  if (!parsed || !hasAnyPropertyDocumentField(parsed)) {
    return {
      ok: false,
      error: "This doesn't look like a supported property document, or no details could be read from it.",
    };
  }

  const patch = toRealEstateMetadataPatch(parsed);
  const fields = Object.entries(patch).map(([key, value]) => ({
    key,
    value:
      typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value),
  }));

  return { ok: true, documentType: parsed.type, patch, fields };
}

const isEmptyMetadataValue = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === "" ||
  value === 0 ||
  (Array.isArray(value) &&
    value.every(
      (v) => v === null || (typeof v === "object" && !Object.values(v as object).some(Boolean)),
    ));

/**
 * Step 2: merges a confirmed document patch into the asset's metadata. Only
 * keys that exist on `RealEstateMetadata` are accepted, and by default only
 * fields that are currently empty are filled — `overwrite` replaces values
 * that are already set. No schema change: it's the same jsonb object the
 * rest of the app reads via `parseRealEstateMetadata`.
 */
export async function applyPropertyDocumentPatch(
  assetId: string,
  patch: Partial<RealEstateMetadata>,
  overwrite: boolean,
): Promise<{ ok: true; applied: number } | { ok: false; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to import a document." };

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{ id: string; metadata: Json | null; asset_categories: { name: string } | null }>();

  if (!asset) return { ok: false, error: "Asset not found." };
  if (asset.asset_categories?.name !== "Real Estate") {
    return { ok: false, error: "Document import is only available for Real Estate assets." };
  }

  const metadata = parseRealEstateMetadata(asset.metadata) as Record<string, unknown>;
  const allowedKeys = new Set(Object.keys(EMPTY_REAL_ESTATE_METADATA));
  const next: Record<string, unknown> = { ...metadata };
  let applied = 0;

  for (const [key, value] of Object.entries(patch)) {
    if (!allowedKeys.has(key)) continue;
    if (!overwrite && !isEmptyMetadataValue(metadata[key])) continue;
    next[key] = value;
    applied++;
  }

  if (applied === 0) return { ok: true, applied: 0 };

  const { error } = await supabase
    .from("assets")
    .update({ metadata: next as Json })
    .eq("id", assetId)
    .eq("profile_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
  return { ok: true, applied };
}

export type DldCertificate = {
  reference: string;
  isMock: boolean;
  valuationAmount: number;
  valuationDate: string;
  currency: string;
  propertyName: string;
  titleDeedNumber: string;
  plotId: string;
};

/**
 * Builds the Dubai Land Department Smart Valuation certificate for a
 * ready-built Dubai property so the user can view/download it and verify
 * the figure. The reference (e.g. `MOCK-SV-BE22723A`) and amount come from
 * `getSmartValuation`, which in mock mode is a deterministic function of the
 * property's Title Deed Number + Plot ID, so it reproduces the exact
 * certificate a previous refresh issued; the date/amount prefer the latest
 * `dubailand` `asset_history` row (what was actually recorded) when one
 * exists. Read-only.
 */
export async function getDldCertificate(
  id: string,
): Promise<{ ok: true; certificate: DldCertificate } | { ok: false; code: string; error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "unauthorized", error: "You must be signed in to view a certificate." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, name, currency, metadata, asset_categories(name)")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      name: string;
      currency: string;
      metadata: Json | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset || asset.asset_categories?.name !== "Real Estate") {
    return { ok: false, code: "not_found", error: "Real Estate asset not found." };
  }

  const metadata = parseRealEstateMetadata(asset.metadata);
  if (metadata.emirate === "abu_dhabi" || metadata.is_offplan) {
    return {
      ok: false,
      code: "invalid_request",
      error: "Smart Valuation certificates exist only for ready-built Dubai properties.",
    };
  }

  const result = await getSmartValuation({
    titleDeedNumber: metadata.title_deed_number,
    plotId: metadata.plot_id,
  });
  if (!result.ok) return { ok: false, code: result.code, error: result.error };

  const { data: recorded } = await supabase
    .from("asset_history")
    .select("recorded_date, value")
    .eq("asset_id", id)
    .eq("source", "dubailand")
    .order("recorded_date", { ascending: false })
    .limit(1)
    .maybeSingle<{ recorded_date: string; value: number }>();

  return {
    ok: true,
    certificate: {
      reference: result.certificate_reference,
      isMock: result.isMock,
      valuationAmount: recorded?.value ?? result.ai_valuation_amount,
      valuationDate: recorded?.recorded_date ?? result.valuation_date,
      currency: asset.currency,
      propertyName: asset.name,
      titleDeedNumber: metadata.title_deed_number,
      plotId: metadata.plot_id,
    },
  };
}

export type AdrecLiveValuationResult =
  | { ok: true; isMock: boolean; data: AdrecValuationData }
  | { ok: false; code: string; error: string };

/**
 * Display-only live ADREC valuation for a ready-built Abu Dhabi property —
 * calls `fetchAdrecValuation` (the `adrec-pricing` Edge Function) with the
 * asset's saved ADREC identifiers and returns the result **without
 * persisting anything**; `refreshAdrecValuation` above is the action that
 * writes a valuation into the asset/history.
 */
export async function getAdrecLiveValuation(id: string): Promise<AdrecLiveValuationResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, code: "unauthorized", error: "You must be signed in to fetch a valuation." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      metadata: Json | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset || asset.asset_categories?.name !== "Real Estate") {
    return { ok: false, code: "not_found", error: "Real Estate asset not found." };
  }

  const metadata = parseRealEstateMetadata(asset.metadata);
  if (metadata.emirate !== "abu_dhabi" || metadata.is_offplan) {
    return {
      ok: false,
      code: "invalid_request",
      error: "Live ADREC valuation is only available for ready-built Abu Dhabi properties.",
    };
  }

  return fetchAdrecValuation({
    plotNumber: metadata.adrec_plot_number,
    unitId: metadata.adrec_unit_id,
    titleDeedNumber: metadata.adrec_title_deed,
  });
}

/**
 * CSV Bank Uploads (`tracker/CSV-Bank-Uploads.md`, Phase 1 Step 8) —
 * backend half only, built ahead of the upload UI. Takes rows already
 * parsed and validated by `parseBankCsvRows` (see `lib/bank-csv.ts`) and
 * upserts them into `asset_history` for one existing asset, same
 * `onConflict: "asset_id,recorded_date"` pattern as `syncAssetHistory`'s
 * auto-generated Real Estate timeline — a re-import regenerates rows in
 * place instead of duplicating them.
 *
 * `current_value` is set to whichever imported row has the latest
 * `recorded_date` (a CSV need not be in chronological order), matching
 * `updateAssetValuation`'s existing behavior of trusting the newest
 * recorded valuation. `net_equity` is set equal to `value` — correct for
 * a Cash-style account with no separate debt to subtract, same simplification
 * `syncAssetHistory` already makes for every non-Real-Estate category.
 */
export async function importBankCsvHistory(
  assetId: string,
  rows: ParsedBankCsvRow[],
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to import bank history." };
  }

  if (rows.length === 0) {
    return { error: "No valid rows to import." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{ id: string }>();

  if (!asset) {
    return { error: "Asset not found." };
  }

  const source: AssetHistorySource = "csv_import";

  const { error: historyError } = await supabase.from("asset_history").upsert(
    rows.map((row) => ({
      asset_id: assetId,
      recorded_date: row.recorded_date,
      value: row.value,
      net_equity: row.value,
      source,
    })),
    { onConflict: "asset_id,recorded_date" },
  );

  if (historyError) {
    return { error: historyError.message };
  }

  const latest = rows.reduce((latest, row) =>
    row.recorded_date > latest.recorded_date ? row : latest,
  );

  const { error: updateError } = await supabase
    .from("assets")
    .update({ current_value: latest.value })
    .eq("id", assetId)
    .eq("profile_id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);

  return { success: true as const, imported: rows.length };
}

export async function deleteAsset(id: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to delete an asset." };
  }

  const { error } = await supabase
    .from("assets")
    .delete()
    .eq("id", id)
    .eq("profile_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard", "layout");
}

/**
 * Batch delete for the dashboard's multi-select checkboxes. A single
 * `.delete().in("id", ids)` call is already one atomic SQL `DELETE`
 * statement — every row is removed in a single all-or-nothing transaction
 * at the Postgres level, same as `deleteAsset`'s single-row delete just
 * extended to a list, so no separate RPC/transaction wrapper is needed.
 * `asset_history` rows cascade automatically (`on delete cascade`,
 * `0001_initial_schema.sql`).
 */
export async function batchDeleteAssets(ids: string[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to delete assets." };
  }

  if (ids.length === 0) {
    return { error: "No assets selected." };
  }

  const { error } = await supabase
    .from("assets")
    .delete()
    .in("id", ids)
    .eq("profile_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard", "layout");
}

/**
 * Live Pricing (`tracker/Live-Pricing.md`, Phase 1 Step 9) — persists a
 * freshly-fetched unit price for an Equities/Crypto asset. Unlike
 * `updateAssetValuation` (which takes a total value the user typed
 * directly), this takes a *unit* price from `refresh-market-price` and
 * multiplies by the asset's own `quantity` to get the total, per this
 * note's requirement that a refresh update "quantity-based total value."
 * Writes `last_unit_price`/`last_priced_at`/`last_price_source` into
 * `metadata` (no dedicated DB columns for these — same
 * store-it-in-metadata pattern as Real Estate's `market_valuation`), and
 * `.upsert()`s the `asset_history` row (unlike `updateAssetValuation`'s
 * plain `.insert()`) since a live-price refresh is realistically triggered
 * more than once a day and would otherwise violate the
 * `(asset_id, recorded_date)` unique constraint on a same-day re-run.
 */
export async function refreshMarketPrice(
  id: string,
  unitPrice: number,
  source: AssetHistorySource,
  extra?: {
    /** The listing's trading currency, if it may differ from the asset's. */
    currency?: string;
    openPrice?: number;
    previousClose?: number;
    dayChangePct?: number;
    exchange?: string;
  },
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to refresh a market price." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, quantity, currency, metadata")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{ id: string; quantity: number; currency: string; metadata: Json | null }>();

  if (!asset) {
    return { error: "Asset not found." };
  }

  const rates = extra?.currency && extra.currency !== asset.currency
    ? await getExchangeRatesFromUsd()
    : {};
  const persisted = await persistQuote(
    supabase,
    user.id,
    asset,
    {
      unitPrice,
      currency: extra?.currency ?? asset.currency,
      asOf: new Date().toISOString(),
      source,
      openPrice: extra?.openPrice,
      previousClose: extra?.previousClose,
      dayChangePct: extra?.dayChangePct,
      exchange: extra?.exchange,
    },
    rates,
  );

  if ("error" in persisted) {
    return { error: persisted.error };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${id}`);

  return { success: true as const, ...persisted };
}

/** A live Finnhub quote (via the `refresh-market-price` Edge Function), in the listing's trading currency. */
type LiveQuote = {
  unitPrice: number;
  currency: string;
  asOf: string;
  source: AssetHistorySource;
  openPrice?: number;
  previousClose?: number;
  dayChangePct?: number;
  exchange?: string;
};

async function fetchLiveEquityQuote(
  supabase: SupabaseClient,
  assetId: string,
  symbol: string,
  currency: string,
  hints?: { exchange?: string; isin?: string },
): Promise<{ ok: true; quote: LiveQuote } | { ok: false; code: string; error: string }> {
  const { data, error } = await supabase.functions.invoke("refresh-market-price", {
    body: {
      assetId,
      category: "equities",
      symbol,
      currency,
      // Lets the Edge Function send non-US listings to Yahoo Finance.
      exchange: hints?.exchange,
      isin: hints?.isin,
    },
  });

  if (error) {
    // A non-2xx Edge Function response surfaces as a generic transport error;
    // the real { error: { code, message } } body is on `error.context`.
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) {
        return { ok: false, code: body.error.code ?? "network_error", error: body.error.message };
      }
    } catch {
      // fall through
    }
    return { ok: false, code: "network_error", error: error.message };
  }

  if (data?.error) {
    return { ok: false, code: data.error.code ?? "network_error", error: data.error.message };
  }
  if (typeof data?.unitPrice !== "number" || !(data.unitPrice > 0)) {
    return { ok: false, code: "invalid_response", error: "Received an unexpected quote response." };
  }

  return {
    ok: true,
    quote: {
      unitPrice: data.unitPrice,
      currency: String(data.currency ?? currency).toUpperCase(),
      asOf: data.asOf ?? new Date().toISOString(),
      source: (data.source ?? "finnhub") as AssetHistorySource,
      openPrice: data.openPrice,
      previousClose: data.previousClose,
      dayChangePct: data.dayChangePct,
      exchange: data.exchange,
    },
  };
}

/**
 * Writes a live quote onto an Equities/Crypto asset: converts it into the
 * asset's own currency if the listing trades in another (Finnhub quotes in
 * the listing currency, which need not match what the user stored), sets
 * `current_value = quantity × price`, records `last_unit_price` / open /
 * previous close / normalized exchange into `metadata`, and upserts today's
 * `asset_history` row.
 */
async function persistQuote(
  supabase: SupabaseClient,
  userId: string,
  asset: { id: string; quantity: number; currency: string; metadata: Json | null },
  quote: LiveQuote,
  rates: Record<string, number>,
): Promise<{ error: string } | { unitPrice: number; totalValue: number; asOf: string }> {
  const toAssetCurrency = (n: number) => convertAmount(n, quote.currency, asset.currency, rates);
  const unitPrice = toAssetCurrency(quote.unitPrice);
  const quantity = asset.quantity ?? 1;
  const totalValue = quantity * unitPrice;

  const existingMetadata =
    asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? (asset.metadata as Record<string, Json>)
      : {};

  const nextMetadata: Record<string, Json> = {
    ...existingMetadata,
    last_unit_price: unitPrice,
    last_priced_at: quote.asOf,
    last_price_source: quote.source,
  };
  if (quote.openPrice != null) nextMetadata.open_price = toAssetCurrency(quote.openPrice);
  if (quote.previousClose != null) {
    nextMetadata.previous_close = toAssetCurrency(quote.previousClose);
  }
  if (quote.dayChangePct != null) nextMetadata.day_change_pct = quote.dayChangePct;
  if (quote.exchange) nextMetadata.exchange = normalizeExchange(quote.exchange);

  const { error: updateError } = await supabase
    .from("assets")
    .update({ current_value: totalValue, metadata: nextMetadata })
    .eq("id", asset.id)
    .eq("profile_id", userId);
  if (updateError) return { error: updateError.message };

  const historyRow = {
    asset_id: asset.id,
    recorded_date: quote.asOf.slice(0, 10),
    value: totalValue,
    net_equity: totalValue,
  };
  let { error: historyError } = await supabase
    .from("asset_history")
    .upsert({ ...historyRow, source: quote.source }, { onConflict: "asset_id,recorded_date" });
  // `yahoo` needs migration 0014 (DB CHECK on asset_history.source). Until it
  // is applied, record the row as `manual` rather than failing the refresh
  // after the asset itself was already updated; `metadata.last_price_source`
  // still carries the true provider.
  if (historyError?.code === "23514" && quote.source === "yahoo") {
    ({ error: historyError } = await supabase
      .from("asset_history")
      .upsert({ ...historyRow, source: "manual" }, { onConflict: "asset_id,recorded_date" }));
  }
  if (historyError) return { error: historyError.message };

  return { unitPrice, totalValue, asOf: quote.asOf };
}

export type RefreshBrokerageQuotesResult = {
  ticker: string;
  /** `skipped` = Finnhub has no data for this ticker (free tier doesn't cover non-US listings): not a failure, the holding keeps its last price / cost basis. */
  status: "updated" | "error" | "skipped";
  message?: string;
  /** Edge Function error code on failure, e.g. `invalid_api_key` — lets the UI flag a bad/missing Finnhub key distinctly. */
  code?: string;
};

/** Codes after which every further call in the batch would fail the same way — an unusable Finnhub key, or a provider rate limit (Finnhub or Yahoo): stop calling and report the rest with the same code. */
const API_KEY_ERROR_CODES = new Set(["invalid_api_key", "provider_not_configured", "rate_limited"]);

/**
 * Re-prices every Brokerage Account holding (or just `assetIds`) from
 * Finnhub via the existing `refresh-market-price` Edge Function — the same
 * connection the single-asset "Refresh Market Price" button uses. Sequential
 * (Finnhub's free tier is rate limited) and independent per ticker: one
 * uncovered/failed symbol is reported and skipped, never aborting the batch
 * or zeroing that holding's existing value.
 */
export async function refreshBrokerageQuotes(
  assetIds?: string[],
): Promise<{ error: string } | { results: RefreshBrokerageQuotesResult[] }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to refresh prices." };
  }

  const { data: category } = await supabase
    .from("asset_categories")
    .select("id")
    .eq("name", "Equities")
    .single<{ id: string }>();
  if (!category) return { error: 'The "Equities" category is missing from this project.' };

  let query = supabase
    .from("assets")
    .select("id, quantity, currency, ticker_symbol, metadata")
    .eq("profile_id", user.id)
    .eq("category_id", category.id);
  if (assetIds && assetIds.length > 0) query = query.in("id", assetIds);

  const { data: assets } = await query.returns<
    {
      id: string;
      quantity: number;
      currency: string;
      ticker_symbol: string | null;
      metadata: Json | null;
    }[]
  >();

  const rates = await getExchangeRatesFromUsd();
  const results = await priceEquityAssets(supabase, user.id, assets ?? [], rates);

  revalidatePath("/dashboard", "layout");
  return { results };
}

async function priceEquityAssets(
  supabase: SupabaseClient,
  userId: string,
  assets: {
    id: string;
    quantity: number;
    currency: string;
    ticker_symbol: string | null;
    metadata: Json | null;
  }[],
  rates: Record<string, number>,
): Promise<RefreshBrokerageQuotesResult[]> {
  const results: RefreshBrokerageQuotesResult[] = [];
  let keyProblem: { code: string; message: string } | null = null;
  for (const asset of assets) {
    const ticker = asset.ticker_symbol?.trim();
    if (!ticker || !(asset.quantity > 0)) continue;

    // A rejected/missing API key fails every ticker the same way, so stop
    // calling Finnhub and report the rest with the same code. Nothing is
    // written on failure, so each holding keeps its last price / cost basis.
    if (keyProblem) {
      results.push({ ticker, status: "error", ...keyProblem });
      continue;
    }

    const eqMeta = parseEquityMetadata(asset.metadata);
    const quote = await fetchLiveEquityQuote(supabase, asset.id, ticker, asset.currency, {
      exchange: eqMeta.exchange_mic || eqMeta.exchange || undefined,
      isin: eqMeta.isin,
    });
    if (!quote.ok) {
      if (quote.code === "no_data") {
        results.push({ ticker, status: "skipped", code: "no_data" });
        continue;
      }
      if (API_KEY_ERROR_CODES.has(quote.code)) {
        keyProblem = { code: quote.code, message: quote.error };
      }
      results.push({ ticker, status: "error", code: quote.code, message: quote.error });
      continue;
    }
    const persisted = await persistQuote(supabase, userId, asset, quote.quote, rates);
    results.push(
      "error" in persisted
        ? { ticker, status: "error", message: persisted.error }
        : { ticker, status: "updated" },
    );
  }
  return results;
}



export type ImportBrokerTradesResult = {
  ticker: string;
  status: "created" | "updated" | "unchanged" | "error";
  message?: string;
  /** True once a live Finnhub quote priced this holding; false means it is valued at cost basis until a refresh succeeds. */
  priced?: boolean;
  /** Why pricing failed (Edge Function code), e.g. `invalid_api_key`. */
  code?: string;
};

/**
 * Writes the invested-capital history for an imported holding: one
 * `asset_history` row per trade date (cost basis of the open position after
 * that day, `buildInvestedCapitalSeries`), so the portfolio chart starts at
 * the earliest trade instead of flatlining until the import date. Idempotent
 * (upsert on asset/date), so re-importing rebuilds it in place.
 */
async function backfillInvestedCapital(
  supabase: SupabaseClient,
  assetId: string,
  trades: EquityTrade[],
  source: AssetHistorySource,
) {
  const series = buildInvestedCapitalSeries(trades);
  if (series.length === 0) return;
  await supabase.from("asset_history").upsert(
    series.map((p) => ({
      asset_id: assetId,
      recorded_date: p.date,
      value: p.value,
      net_equity: p.value,
      source,
    })),
    { onConflict: "asset_id,recorded_date" },
  );
}

/**
 * Broker Trade Import (Phase 2, `tracker/Broker-Trade-Import.md`) — persists
 * a broker parser's aggregated holdings (`aggregateTrades()` in
 * `lib/parsers/broker-registry.ts`) as Equities assets. For each holding:
 * finds an existing Equities asset with a matching `ticker_symbol` for this
 * user and appends only the genuinely new trades (deduped via `tradeId()`,
 * so re-uploading an export that overlaps a previous import doesn't
 * double-count), or creates a new asset if none exists. `current_value` is
 * set from `quantity × estimateCostBasisUnitPrice(...)` — cost basis, not a
 * live price, until "Refresh Market Price" is run. Processes every holding
 * independently and reports a per-ticker outcome, so one bad row doesn't
 * abort the whole batch.
 */
export async function importBrokerTrades(
  holdings: AggregatedHolding[],
  options?: {
    /** e.g. "Saxobank" — used with `accountId` to name the generated assets. */
    brokerName?: string;
    /** Brokerage account/client number found in the file. */
    accountId?: string | null;
    /** Cash dividends from the file, attached to holdings by `TICKER:EXCHANGE` and stored as `metadata.income`/`total_income`. */
    dividends?: ParsedIncome[];
  },
): Promise<{ error: string } | { results: ImportBrokerTradesResult[] }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to import broker trades." };
  }

  const { data: equitiesCategory } = await supabase
    .from("asset_categories")
    .select("id")
    .eq("name", "Equities")
    .single<{ id: string }>();

  if (!equitiesCategory) {
    return { error: 'The "Equities" category is missing from this project.' };
  }

  const source: AssetHistorySource = "broker_import";
  const today = new Date().toISOString().slice(0, 10);
  const results: ImportBrokerTradesResult[] = [];
  // Hierarchy: Brokerage Account → "Saxobank Acc. # 10164571" → holding. Each
  // holding is its own asset (priced individually) named after the company;
  // the account lives in metadata and is shown as the table's middle level.
  const accountId = options?.accountId?.trim() || null;
  const fxRates = options?.dividends?.length ? await getExchangeRatesFromUsd() : {};
  // Dividends for a holding, converted into its currency (Saxo books them in
  // the account currency, which can differ from the instrument's).
  const incomeFor = (holding: AggregatedHolding): EquityIncome[] => {
    const key = holding.exchange ? `${holding.ticker}:${holding.exchange}` : holding.ticker;
    return (options?.dividends ?? [])
      .filter((d) => d.key === key)
      .map((d) => ({
        ...(d.id ? { id: d.id } : {}),
        date: d.date,
        amount:
          Math.round(convertAmount(d.amount, d.currency, holding.currency, fxRates) * 100) / 100,
      }));
  };
  const mergeIncome = (existing: EquityIncome[] | undefined, incoming: EquityIncome[]) => {
    const seen = new Set((existing ?? []).map((i) => i.id ?? `${i.date}|${i.amount}`));
    const fresh = incoming.filter((i) => !seen.has(i.id ?? `${i.date}|${i.amount}`));
    return [...(existing ?? []), ...fresh];
  };
  const incomeMeta = (list: EquityIncome[]) => ({
    income: list,
    total_income: Math.round(list.reduce((s, i) => s + i.amount, 0) * 100) / 100,
  });
  const accountLabel = accountId
    ? `${options?.brokerName ?? "Broker"} Acc. # ${accountId}`
    : null;
  const touched: { id: string; ticker: string; currency: string; quantity: number; metadata: Json }[] = [];

  for (const holding of holdings) {
    if (holding.trades.length === 0) {
      results.push({ ticker: holding.ticker, status: "unchanged" });
      continue;
    }

    const { data: existing } = await supabase
      .from("assets")
      .select("id, name, quantity, metadata")
      .eq("profile_id", user.id)
      .eq("category_id", equitiesCategory.id)
      .ilike("ticker_symbol", holding.ticker)
      .maybeSingle<{ id: string; name: string; quantity: number; metadata: Json | null }>();

    if (existing) {
      const existingMetadata = parseEquityMetadata(existing.metadata);
      const existingIds = new Set(existingMetadata.trades.map((t) => t.id));

      const newTrades: EquityTrade[] = holding.trades
        .filter((t) => !existingIds.has(tradeId(t)))
        .map((t) => ({
          id: tradeId(t),
          tradeDate: t.tradeDate,
          side: t.side,
          quantity: t.quantity,
          price: t.price,
          currency: t.currency,
          source,
          exchangeRate: t.exchangeRate,
          brokerage: t.brokerage,
          bookedAmount: t.bookedAmount,
        }));

      // Identity backfill: assets from earlier imports were named with an
      // internal path ("Brokerage Account / … / UBIP") and have no company
      // name/ISIN/account label stored. Re-importing the same file repairs
      // them even when it contains no new trades.
      const mergedIncome = mergeIncome(existingMetadata.income, incomeFor(holding));
      const incomeChanged = mergedIncome.length !== (existingMetadata.income?.length ?? 0);
      const identityNeeded =
        incomeChanged ||
        (Boolean(holding.exchange) && !existingMetadata.exchange_mic) ||
        existing.name.startsWith("Brokerage Account /") ||
        !existingMetadata.instrument_name ||
        (Boolean(holding.isin) && !existingMetadata.isin) ||
        (accountLabel !== null && existingMetadata.account_name !== accountLabel);
      const identityMetadata = {
        ...(mergedIncome.length > 0 ? incomeMeta(mergedIncome) : {}),
        ...(holding.exchange ? { exchange_mic: holding.exchange } : {}),
        instrument_name: holding.instrumentName,
        ...(holding.isin ? { isin: holding.isin } : {}),
        ...(accountId && accountLabel ? { account_id: accountId, account_name: accountLabel } : {}),
      };
      const identityName = existing.name.startsWith("Brokerage Account /")
        ? holding.instrumentName
        : existing.name;

      if (newTrades.length === 0) {
        if (!identityNeeded) {
          results.push({ ticker: holding.ticker, status: "unchanged" });
          continue;
        }
        const { error: identityError } = await supabase
          .from("assets")
          .update({ name: identityName, metadata: { ...existingMetadata, ...identityMetadata } as Json })
          .eq("id", existing.id)
          .eq("profile_id", user.id);
        results.push(
          identityError
            ? { ticker: holding.ticker, status: "error", message: identityError.message }
            : { ticker: holding.ticker, status: "updated", message: "Name/ISIN/account updated." },
        );
        continue;
      }

      const quantityDelta = newTrades.reduce(
        (sum, t) => sum + (t.side === "buy" ? t.quantity : -t.quantity),
        0,
      );
      const newQuantity = existing.quantity + quantityDelta;

      const allTrades = [...existingMetadata.trades, ...newTrades];
      const unitPrice = existingMetadata.last_unit_price ?? estimateCostBasisUnitPrice(allTrades);
      const nextMetadata: Json = {
        ...existingMetadata,
        exchange: normalizeExchange(existingMetadata.exchange || holding.exchange),
        ...identityMetadata,
        trades: allTrades,
      };

      const updatePayload: {
        metadata: Json;
        quantity: number;
        name: string;
        current_value?: number;
      } = {
        metadata: nextMetadata,
        quantity: newQuantity,
        name: identityName,
      };
      if (unitPrice != null) {
        updatePayload.current_value = Math.max(0, newQuantity) * unitPrice;
      }

      const { error: updateError } = await supabase
        .from("assets")
        .update(updatePayload)
        .eq("id", existing.id)
        .eq("profile_id", user.id);

      if (updateError) {
        results.push({ ticker: holding.ticker, status: "error", message: updateError.message });
        continue;
      }

      await backfillInvestedCapital(supabase, existing.id, allTrades, source);

      if (updatePayload.current_value != null) {
        await supabase.from("asset_history").upsert(
          {
            asset_id: existing.id,
            recorded_date: today,
            value: updatePayload.current_value,
            net_equity: updatePayload.current_value,
            source,
          },
          { onConflict: "asset_id,recorded_date" },
        );
      }

      touched.push({
        id: existing.id,
        ticker: holding.ticker,
        currency: holding.currency,
        quantity: newQuantity,
        metadata: nextMetadata,
      });
      results.push({ ticker: holding.ticker, status: "updated", priced: false });
    } else {
      // A fully-closed position (net quantity 0) has nothing to hold or
      // value — creating it would just add a zero-value row.
      if (!(holding.netQuantity > 0)) {
        results.push({
          ticker: holding.ticker,
          status: "unchanged",
          message: "Closed position — not imported.",
        });
        continue;
      }

      const trades: EquityTrade[] = holding.trades.map((t) => ({
        id: tradeId(t),
        tradeDate: t.tradeDate,
        side: t.side,
        quantity: t.quantity,
        price: t.price,
        currency: t.currency,
        source,
        exchangeRate: t.exchangeRate,
        brokerage: t.brokerage,
        bookedAmount: t.bookedAmount,
      }));

      // Never seed a zero value: fall back from cost basis to the latest
      // trade price; the live Finnhub quote below then replaces either.
      const latestTradePrice = [...trades].sort((a, b) =>
        b.tradeDate.localeCompare(a.tradeDate),
      )[0]?.price;
      const unitPrice = estimateCostBasisUnitPrice(trades) || latestTradePrice || 0;
      const currentValue = Math.max(0, holding.netQuantity) * unitPrice;
      const openDate =
        trades
          .filter((t) => t.side === "buy")
          .map((t) => t.tradeDate)
          .sort()[0] ?? trades.map((t) => t.tradeDate).sort()[0] ?? today;

      const metadata: Json = {
        ...(accountId ? { account_id: accountId, account_name: accountLabel } : {}),
        instrument_name: holding.instrumentName,
        ...(holding.isin ? { isin: holding.isin } : {}),
        ...(holding.exchange ? { exchange_mic: holding.exchange } : {}),
        ...(incomeFor(holding).length > 0 ? incomeMeta(incomeFor(holding)) : {}),
        exchange: normalizeExchange(holding.exchange),
        last_unit_price: null,
        last_priced_at: null,
        last_price_source: null,
        trades,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("assets")
        .insert({
          profile_id: user.id,
          category_id: equitiesCategory.id,
          name: holding.instrumentName,
          quantity: holding.netQuantity,
          current_value: currentValue,
          currency: holding.currency,
          ticker_symbol: holding.ticker,
          purchase_date: openDate,
          metadata,
        })
        .select("id")
        .single<{ id: string }>();

      if (insertError || !inserted) {
        results.push({
          ticker: holding.ticker,
          status: "error",
          message: insertError?.message ?? "Could not create this asset.",
        });
        continue;
      }

      await backfillInvestedCapital(supabase, inserted.id, trades, source);

      await supabase.from("asset_history").upsert(
        {
          asset_id: inserted.id,
          recorded_date: today,
          value: currentValue,
          net_equity: currentValue,
          source,
        },
        { onConflict: "asset_id,recorded_date" },
      );

      touched.push({
        id: inserted.id,
        ticker: holding.ticker,
        currency: holding.currency,
        quantity: holding.netQuantity,
        metadata,
      });
      results.push({ ticker: holding.ticker, status: "created", priced: false });
    }
  }

  // Replace cost-basis placeholders with live Finnhub quotes (same
  // connection as the single-asset Refresh Market Price). A holding whose
  // quote fails keeps its cost-basis value and is flagged `priced: false`.
  if (touched.length > 0) {
    const rates = await getExchangeRatesFromUsd();
    const priced = await priceEquityAssets(
      supabase,
      user.id,
      touched.map((a) => ({
        id: a.id,
        quantity: a.quantity,
        currency: a.currency,
        ticker_symbol: a.ticker,
        metadata: a.metadata,
      })),
      rates,
    );
    for (const p of priced) {
      const row = results.find((r) => r.ticker === p.ticker);
      if (!row) continue;
      row.priced = p.status === "updated";
      if (p.status === "error") {
        row.message = p.message;
        row.code = p.code;
      }
    }
  }

  revalidatePath("/dashboard", "layout");

  return { results };
}

export type ImportTenancyContractResult =
  | { ok: true; parsed: ParsedTenancyContract }
  | { ok: false; error: string };

/**
 * Extracts tenancy details from an uploaded Ejari (Dubai) or Tawtheeq
 * (Abu Dhabi) contract PDF — picked via the asset's `metadata.emirate` — and
 * appends them as a new entry in `metadata.tenancy_contracts` (see
 * `lib/tenancy-parser.ts` for the extraction logic). A property is re-let
 * contract after contract (e.g. 2025-2026, then 2026-2027), so importing a
 * new PDF always adds a new period rather than overwriting the last one.
 */
export async function importTenancyContract(
  assetId: string,
  formData: FormData,
): Promise<ImportTenancyContractResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to import a tenancy contract." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file was uploaded." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      metadata: Json | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset) {
    return { ok: false, error: "Asset not found." };
  }

  if (asset.asset_categories?.name !== "Real Estate") {
    return {
      ok: false,
      error: "Tenancy contract import is only available for Real Estate assets.",
    };
  }

  const metadata = parseRealEstateMetadata(asset.metadata);

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    text = result.text;
  } catch {
    return { ok: false, error: "Could not read this PDF file." };
  }

  const extracted = parseTenancyContract(text, metadata.emirate);
  if (!hasAnyExtractedField(extracted)) {
    return {
      ok: false,
      error: "Couldn't find any recognizable tenancy details in this contract.",
    };
  }

  const newContract: TenancyContract = {
    id: nextTenancyContractId(),
    tenant_name: extracted.tenant_name ?? "",
    start_date: extracted.tenancy_start_date ?? "",
    end_date: extracted.tenancy_end_date ?? "",
    annual_rent: extracted.annual_rent,
    contract_value: extracted.tenancy_contract_value,
    imported_from_file: file.name,
    uploaded_at: new Date().toISOString().slice(0, 10),
  };

  const nextMetadata = {
    ...metadata,
    tenancy_contracts: [...metadata.tenancy_contracts, newContract],
  };

  const { error: updateError } = await supabase
    .from("assets")
    .update({ metadata: nextMetadata })
    .eq("id", assetId)
    .eq("profile_id", user.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);

  return { ok: true, parsed: extracted };
}

export type RefreshVehicleValuationResult =
  | {
      ok: true;
      isMock: boolean;
      value: number;
      depreciationTrend: "accelerating" | "stable" | "slowing";
      provider: "la_centrale" | "autobiz";
    }
  | { ok: false; code?: VehicleValuationErrorCode; error: string };

/**
 * French vehicle valuation integration (`lib/services/vehicle-valuation-client.ts`).
 *
 * DISABLED (2026-09-29): that client has always been a fully-mocked stub —
 * there is no real commercial API access to La Centrale/Autobiz — and its
 * deterministic-hash placeholder numbers were being mistaken for a real
 * market valuation. This now always returns "under_development" without
 * touching the provider, the asset lookup, or the database at all, so the
 * button can never overwrite `assets.current_value`/`asset_history` with a
 * fabricated figure. The previous real-looking implementation (asset lookup,
 * `getVehicleValuation()` call, `current_value`/`asset_history` writes) is
 * preserved in git history and should be restored once real provider
 * credentials exist.
 */
export async function refreshVehicleValuation(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so the call signature (and future re-wiring) don't change
  id: string,
): Promise<RefreshVehicleValuationResult> {
  return {
    ok: false,
    code: "under_development",
    error: "Vehicle market value refresh is under development. No data was changed.",
  };
}

/** Shared load-and-authorize step for the small tenancy-contract/property-expense mutations below — each only ever patches one array inside a Real Estate asset's metadata. */
async function loadRealEstateMetadataForMutation(
  assetId: string,
): Promise<
  | { ok: true; supabase: SupabaseClient; userId: string; metadata: RealEstateMetadata }
  | { ok: false; error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to update this property." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      metadata: Json | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset) {
    return { ok: false, error: "Asset not found." };
  }

  if (asset.asset_categories?.name !== "Real Estate") {
    return { ok: false, error: "This action is only available for Real Estate assets." };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    metadata: parseRealEstateMetadata(asset.metadata),
  };
}

/** Removes one tenancy period (e.g. a superseded 2025-2026 contract) — the property may have several logged over time, see `importTenancyContract`. */
export async function deleteTenancyContract(assetId: string, contractId: string) {
  const loaded = await loadRealEstateMetadataForMutation(assetId);
  if (!loaded.ok) return { error: loaded.error };

  const nextMetadata = {
    ...loaded.metadata,
    tenancy_contracts: loaded.metadata.tenancy_contracts.filter((c) => c.id !== contractId),
  };

  const { error } = await loaded.supabase
    .from("assets")
    .update({ metadata: nextMetadata })
    .eq("id", assetId)
    .eq("profile_id", loaded.userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
}

/** Logs one property expense (maintenance, service charges, etc.) — these accumulate in `metadata.property_expenses` rather than being overwritten, since real costs are lumpy and dated, not one flat monthly figure. */
export async function addPropertyExpense(
  assetId: string,
  expense: { description: string; date: string; amount: number },
) {
  const loaded = await loadRealEstateMetadataForMutation(assetId);
  if (!loaded.ok) return { error: loaded.error };

  const newExpense: PropertyExpense = {
    id: nextPropertyExpenseId(),
    description: expense.description,
    date: expense.date,
    amount: expense.amount,
  };

  const nextMetadata = {
    ...loaded.metadata,
    property_expenses: [...loaded.metadata.property_expenses, newExpense],
  };

  const { error } = await loaded.supabase
    .from("assets")
    .update({ metadata: nextMetadata })
    .eq("id", assetId)
    .eq("profile_id", loaded.userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
}

export async function deletePropertyExpense(assetId: string, expenseId: string) {
  const loaded = await loadRealEstateMetadataForMutation(assetId);
  if (!loaded.ok) return { error: loaded.error };

  const nextMetadata = {
    ...loaded.metadata,
    property_expenses: loaded.metadata.property_expenses.filter((e) => e.id !== expenseId),
  };

  const { error } = await loaded.supabase
    .from("assets")
    .update({ metadata: nextMetadata })
    .eq("id", assetId)
    .eq("profile_id", loaded.userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
}

/**
 * Removes one point from an asset's valuation log (`asset_history`) — e.g.
 * to erase a bad automated refresh (a wrong vehicle/DLD/ADREC valuation) or
 * a mistaken manual entry, for any asset category. Deliberately only deletes
 * the `asset_history` row: it never touches `assets.current_value` or
 * `metadata`, since the point being removed isn't necessarily the most
 * recent one — the headline value is corrected separately via the "Update
 * Value" dialog (`updateAssetValuation`).
 */
export async function deleteAssetHistoryPoint(assetId: string, historyId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to edit the valuation log." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{ id: string }>();

  if (!asset) {
    return { error: "Asset not found." };
  }

  const { error } = await supabase
    .from("asset_history")
    .delete()
    .eq("id", historyId)
    .eq("asset_id", assetId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
}
