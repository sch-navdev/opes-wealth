import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import {
  createMockAdminClient,
  getMockUserId,
  isMockAuthEnabled,
} from "@/utils/supabase/mock-auth";
import { BankingOverview, type BankingAccountRow } from "@/components/banking-overview";
import { T } from "@/components/translated-text";
import { getBankSyncMode } from "@/lib/banking/altareq";
import { getBankProfile } from "@/lib/banking/csv-profiles";
import { accountCountry, countryOfInstitutionName, institutionOfMetadata } from "@/lib/banking/account-country";
import { companyIdOf } from "@/lib/company-cash";
import { pickBalanceDate } from "@/lib/bank-staleness";
import { loadBalanceDateSources } from "@/lib/bank-staleness-load";
import { DEFAULT_BASE_CURRENCY, convertToBaseCurrency, getExchangeRatesFromUsd } from "@/lib/fx";

type CashRow = {
  id: string;
  name: string;
  currency: string;
  current_value: number;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

type LinkRow = {
  asset_id: string | null;
  is_sandbox: boolean;
  account_label: string | null;
  masked_number: string | null;
  currency: string | null;
  last_balance: number | null;
  last_synced_at: string | null;
  last_sync_status: "ok" | "error" | null;
  last_sync_error: string | null;
  bank_connections: { institution_name: string; status: string; last_synced_at: string | null } | null;
};

/**
 * Consolidated banking view: all Cash / bank accounts (manual, CSV, live-synced)
 * plus any SANDBOX accounts, with a Real / Sandbox / All filter. Sandbox links
 * have no asset (migration 0020), so they cannot be part of net worth by
 * construction; here they are only listed and tagged.
 */
export default async function BankingPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  if (!mockUserId && (await needsMfaStepUp(supabase))) redirect("/login/mfa");

  const [{ data: profile }, { data: cashCategory }, rates, { currency }] = await Promise.all([
    supabase.from("profiles").select("default_currency").eq("id", user.id).single(),
    supabase.from("asset_categories").select("id").eq("name", "Cash").maybeSingle(),
    getExchangeRatesFromUsd(),
    searchParams,
  ]);
  const baseCurrency = currency || profile?.default_currency || DEFAULT_BASE_CURRENCY;

  const { data: cash } = cashCategory
    ? await supabase
        .from("assets")
        .select("id, name, currency, current_value, metadata, updated_at")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .eq("category_id", cashCategory.id)
        .eq("is_liability", false)
        .order("name")
        .returns<CashRow[]>()
    : { data: [] as CashRow[] };

  // Company bank accounts (metadata.company_id): the name of the company they belong to. A link to a company that
  // no longer exists is ignored, so the account is listed with the personal ones.
  const linkedCompanyIds = [...new Set((cash ?? []).map((a) => companyIdOf(a.metadata)).filter(Boolean))];
  const companyNameById = new Map<string, string>();
  if (linkedCompanyIds.length > 0) {
    const { data: companyRows } = await supabase
      .from("assets")
      .select("id, name, asset_categories(name)")
      .in("id", linkedCompanyIds)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .returns<{ id: string; name: string; asset_categories: { name: string } | null }[]>();
    for (const c of companyRows ?? []) {
      if (c.asset_categories?.name === "Companies") companyNameById.set(c.id, c.name);
    }
  }

  // If migration 0020 isn't applied this returns nothing and the view is manual-only.
  const { data: links } = await supabase
    .from("bank_account_links")
    .select(
      "asset_id, is_sandbox, account_label, masked_number, currency, last_balance, last_synced_at, last_sync_status, last_sync_error, bank_connections(institution_name, status, last_synced_at)",
    )
    .eq("profile_id", user.id)
    .returns<LinkRow[]>();

  // "Balance as of": newest history date, else newest transaction date, else the asset's updated date.
  const dateSources = await loadBalanceDateSources(
    supabase,
    (cash ?? []).map((a) => a.id),
  );
  const today = new Date().toISOString().slice(0, 10);

  const linkByAsset = new Map((links ?? []).filter((l) => l.asset_id).map((l) => [l.asset_id as string, l]));
  const rows: BankingAccountRow[] = [];

  for (const a of cash ?? []) {
    const link = linkByAsset.get(a.id);
    const profileId = typeof a.metadata?.bank_profile === "string" ? a.metadata.bank_profile : "";
    const ref = typeof a.metadata?.account_ref === "string" ? a.metadata.account_ref : "";
    const institution =
      link?.bank_connections?.institution_name ?? (institutionOfMetadata(a.metadata) || getBankProfile(profileId)?.name) ?? "";
    rows.push({
      key: a.id,
      name: a.name,
      institution,
      country: accountCountry(a.metadata, institution) || undefined,
      masked: link?.masked_number ?? (ref ? `••••${ref.replace(/[^0-9A-Za-z]/g, "").slice(-4)}` : ""),
      currency: a.currency,
      balance: a.current_value,
      baseBalance: convertToBaseCurrency(a.current_value, a.currency, baseCurrency, rates),
      kind: link ? "synced" : "manual",
      status: link ? (link.bank_connections?.status === "expired" ? "expired" : link.last_sync_status) : null,
      lastSyncedAt: link?.last_synced_at ?? link?.bank_connections?.last_synced_at ?? null,
      lastError: link?.last_sync_error ?? null,
      assetId: a.id,
      balanceAsOf: pickBalanceDate({ ...dateSources.get(a.id), updatedAt: a.updated_at }),
      companyName: companyNameById.get(companyIdOf(a.metadata)),
    });
  }

  (links ?? [])
    .filter((l) => l.is_sandbox)
    .forEach((l, i) => {
      const balance = l.last_balance ?? 0;
      const currencyCode = l.currency ?? "AED";
      rows.push({
        key: `sandbox-${i}-${l.masked_number ?? ""}`,
        name: l.account_label ?? "Account",
        institution: l.bank_connections?.institution_name ?? "",
        country: countryOfInstitutionName(l.bank_connections?.institution_name ?? "") || undefined,
        masked: l.masked_number ?? "",
        currency: currencyCode,
        balance,
        baseBalance: convertToBaseCurrency(balance, currencyCode, baseCurrency, rates),
        kind: "sandbox",
        status: l.last_sync_status,
        lastSyncedAt: l.last_synced_at,
        lastError: l.last_sync_error,
      });
    });

  const accounts = (cash ?? []).map((a) => ({
    id: a.id,
    name: companyNameById.get(companyIdOf(a.metadata)) ? `${a.name} (${companyNameById.get(companyIdOf(a.metadata))})` : a.name,
    currency: a.currency,
    nativeValue: a.current_value,
    bankProfile: typeof a.metadata?.bank_profile === "string" ? a.metadata.bank_profile : undefined,
    accountRef: typeof a.metadata?.account_ref === "string" ? a.metadata.account_ref : undefined,
  }));

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          <T k="banking_title" />
        </h1>
        <p className="text-sm text-muted-foreground">
          <T k="banking_subtitle" />
        </p>
      </div>
      <BankingOverview
        rows={rows}
        baseCurrency={baseCurrency}
        mode={getBankSyncMode()}
        today={today}
        statementAccounts={accounts}
        connectableCash={accounts.map((a) => ({ id: a.id, name: a.name, isLinked: linkByAsset.has(a.id) }))}
      />
    </div>
  );
}
