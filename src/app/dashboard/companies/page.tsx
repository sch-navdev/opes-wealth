import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { applyOwnershipFactors, loadCoOwnedAssets, loadOwnershipFactors } from "@/lib/shared-assets/load";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import {
  createMockAdminClient,
  getMockUserId,
  isMockAuthEnabled,
} from "@/utils/supabase/mock-auth";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { Button } from "@/components/ui/button";
import { CompaniesStructure } from "@/components/companies-structure";
import { CompaniesSummary } from "@/components/companies-summary";
import { CompaniesCash, companyCashTotal, type CompanyCashGroup } from "@/components/companies-cash";
import { EntityLookthroughViews } from "@/components/entity-map-switcher";
import { T } from "@/components/translated-text";
import { buildHoldingStructure, parseCompanyMetadata } from "@/lib/companies";
import {
  buildEntityLookthrough,
  buildHoldingOptions,
  type LookthroughAssetRow,
} from "@/lib/entity-lookthrough";
import { companyIdSet, splitCashByCompany } from "@/lib/company-cash";
import { pickBalanceDate } from "@/lib/bank-staleness";
import { loadBalanceDateSources } from "@/lib/bank-staleness-load";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BASE_CURRENCY, convertToBaseCurrency, getExchangeRatesFromUsd } from "@/lib/fx";

type CompanyRow = {
  id: string;
  name: string;
  currency: string;
  current_value: number;
  metadata: Record<string, unknown> | null;
};

type AssetRow = CompanyRow & {
  profile_id: string;
  category_id: string;
  quantity: number;
  is_liability: boolean;
  asset_categories: { name: string } | null;
};

const ASSET_COLUMNS =
  "id, profile_id, name, category_id, quantity, current_value, currency, is_liability, metadata, asset_categories(name)";

/**
 * Companies / Holdings: corporate entities and business ownership you hold
 * personally or through holding companies, kept apart from personal assets and
 * from Private Equity fund commitments. Same dev-only mock-auth bypass as the
 * dashboard page (hard-gated on NODE_ENV === "development").
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();

  const user = mockUserId
    ? { id: mockUserId }
    : (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  if (!mockUserId && (await needsMfaStepUp(supabase))) redirect("/login/mfa");

  const [{ data: categories }, { data: companyCategory }, { data: profile }, rates, { currency }] =
    await Promise.all([
      supabase.from("asset_categories").select("id, name").order("name"),
      supabase.from("asset_categories").select("id").eq("name", "Companies").maybeSingle(),
      supabase.from("profiles").select("default_currency").eq("id", user.id).single(),
      getExchangeRatesFromUsd(),
      searchParams,
    ]);

  const baseCurrency = currency || profile?.default_currency || DEFAULT_BASE_CURRENCY;

  // Every active asset the user can see (own + co-owned), reduced to the user's share exactly like
  // the dashboard: the Companies list below and the look-through (which reconciles with net worth).
  const { data: ownAssets } = companyCategory
    ? await supabase
        .from("assets")
        .select(ASSET_COLUMNS)
        .eq("profile_id", user.id)
        .eq("status", "active")
        .order("name")
        .returns<AssetRow[]>()
    : { data: [] as AssetRow[] };
  const own = ownAssets ?? [];
  const ownIds = new Set(own.map((a) => a.id));
  const shared = companyCategory ? await loadCoOwnedAssets<AssetRow>(supabase, user.id, ASSET_COLUMNS, ownIds) : [];
  const unscaled = [...own, ...shared.filter((a) => !ownIds.has(a.id))];
  const factors = await loadOwnershipFactors(supabase, user.id, unscaled);
  const allAssets = applyOwnershipFactors(unscaled, factors);

  const rows: CompanyRow[] = allAssets.filter((a) => a.category_id === companyCategory?.id);
  const structure = buildHoldingStructure(rows);

  const lookthroughRows: LookthroughAssetRow[] = allAssets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.asset_categories?.name ?? "",
    currency: a.currency,
    current_value: a.current_value,
    is_liability: a.is_liability,
    metadata: a.metadata,
  }));
  const lookthrough = buildEntityLookthrough({ assets: lookthroughRows, baseCurrency, rates });
  const holdingOptions = buildHoldingOptions(lookthroughRows, lookthrough);
  // v1: holdings can be managed on the user's OWN entities that nobody else co-owns (the action re-checks).
  const manageableEntityIds = rows
    .filter((r) => (r as AssetRow).profile_id === user.id && (factors.get(r.id) ?? 1) === 1)
    .map((r) => r.id);

  // Company cash: Cash accounts linked to a company (metadata.company_id). In net worth, apart from the
  // company's value (a company can be sold without its cash); NOT personal cash anywhere else in the app.
  const { byCompany } = splitCashByCompany(allAssets, companyIdSet(allAssets));
  const cashIds = [...byCompany.values()].flat().map((a) => a.id);
  const dateSources = await loadBalanceDateSources(supabase as unknown as SupabaseClient, cashIds);
  const cashGroups: CompanyCashGroup[] = rows.map((company) => ({
    companyId: company.id,
    companyName: company.name,
    accounts: (byCompany.get(company.id) ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      nativeValue: a.current_value,
      baseValue: convertToBaseCurrency(a.current_value, a.currency, baseCurrency, rates),
      institutionName: typeof a.metadata?.institution_name === "string" ? a.metadata.institution_name : undefined,
      balanceAsOf: pickBalanceDate({ ...dateSources.get(a.id), statementThrough: typeof a.metadata?.statement_through === "string" ? a.metadata.statement_through : null }),
    })),
  }));
  const totalCompanyCash = companyCashTotal(cashGroups.flatMap((g) => g.accounts));
  const today = new Date().toISOString().slice(0, 10);

  const baseValues: Record<string, number> = {};
  let totalStake = 0;
  let totalEquity = 0;
  for (const row of rows) {
    const stake = convertToBaseCurrency(row.current_value, row.currency, baseCurrency, rates);
    baseValues[row.id] = stake;
    totalStake += stake;
    const equity = parseCompanyMetadata(row.metadata).company_value;
    if (equity != null) totalEquity += convertToBaseCurrency(equity, row.currency, baseCurrency, rates);
  }

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            <T k="companies_title" />
          </h1>
          <p className="text-sm text-muted-foreground">
            <T k="companies_subtitle" />
          </p>
        </div>
        {companyCategory ? (
          <AddAssetDialog
            categories={categories ?? []}
            defaultCategoryName="Companies"
            companies={rows.map((r) => ({ id: r.id, name: r.name }))}
            trigger={
              <Button type="button">
                <T k="companies_add" />
              </Button>
            }
          />
        ) : null}
      </div>

      {!companyCategory ? (
        <p className="text-sm text-muted-foreground" role="alert">
          <T k="companies_category_missing" />
        </p>
      ) : (
        <>
          <CompaniesSummary
            count={rows.length}
            totalStake={totalStake}
            totalEquity={totalEquity}
            baseCurrency={baseCurrency}
            companyCash={totalCompanyCash}
          />
          <CompaniesCash groups={cashGroups} baseCurrency={baseCurrency} today={today} />
          <CompaniesStructure
            structure={structure}
            baseValues={baseValues}
            baseCurrency={baseCurrency}
          />
          <EntityLookthroughViews
            data={lookthrough}
            options={holdingOptions}
            manageableEntityIds={manageableEntityIds}
          />
        </>
      )}
    </div>
  );
}
