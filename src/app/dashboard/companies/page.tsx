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
import { T } from "@/components/translated-text";
import { buildHoldingStructure, parseCompanyMetadata } from "@/lib/companies";
import { DEFAULT_BASE_CURRENCY, convertToBaseCurrency, getExchangeRatesFromUsd } from "@/lib/fx";

type CompanyRow = {
  id: string;
  name: string;
  currency: string;
  current_value: number;
  metadata: Record<string, unknown> | null;
};

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

  const { data: companies } = companyCategory
    ? await supabase
        .from("assets")
        .select("id, name, currency, current_value, metadata")
        .eq("profile_id", user.id)
        .eq("category_id", companyCategory.id)
        .order("name")
        .returns<CompanyRow[]>()
    : { data: [] as CompanyRow[] };

  // Co-ownership: add companies shared with me and show MY share of each stake.
  const COMPANY_COLUMNS = "id, profile_id, name, currency, current_value, quantity, metadata, asset_categories(name)";
  const ownCompanies = (companies ?? []) as (CompanyRow & { profile_id?: string })[];
  const sharedCompanies = companyCategory
    ? await loadCoOwnedAssets<CompanyRow & { profile_id: string; quantity: number; asset_categories: { name: string } | null }>(
        supabase,
        user.id,
        COMPANY_COLUMNS,
        new Set(ownCompanies.map((c) => c.id)),
        { categoryId: companyCategory.id },
      )
    : [];
  const withOwner = [
    ...ownCompanies.map((c) => ({ ...c, profile_id: c.profile_id ?? user.id, quantity: 1, asset_categories: { name: "Companies" } })),
    ...sharedCompanies,
  ];
  const companyFactors = await loadOwnershipFactors(supabase, user.id, withOwner);
  const rows: CompanyRow[] = applyOwnershipFactors(withOwner, companyFactors);
  const structure = buildHoldingStructure(rows);
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
          />
          <CompaniesStructure
            structure={structure}
            baseValues={baseValues}
            baseCurrency={baseCurrency}
          />
        </>
      )}
    </div>
  );
}
