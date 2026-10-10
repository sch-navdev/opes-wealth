import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { BankDetailView, type BankDetailAccount, type BankDetailTransaction } from "@/components/bank-detail-view";
import { getBankProfile } from "@/lib/banking/csv-profiles";
import { bankGroupName, bankKey, institutionOfMetadata } from "@/lib/banking/account-country";
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
  masked_number: string | null;
  bank_connections: { institution_name: string } | null;
};

const MAX_TRANSACTIONS = 400;

/**
 * One bank: the consolidated balance and transactions of all its accounts (current accounts, savings spaces and
 * cards are one bank), with a link into each account for a deeper look. Same account selection as the Banking
 * page; closed accounts are included and tagged (the view can hide them).
 */
export default async function BankDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ currency?: string }>;
}) {
  const [{ name: rawName }, { currency }] = await Promise.all([params, searchParams]);
  const bankName = decodeURIComponent(rawName);

  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) redirect("/login");
  if (!mockUserId && (await needsMfaStepUp(supabase))) redirect("/login/mfa");

  const [{ data: profile }, { data: cashCategory }, rates] = await Promise.all([
    supabase.from("profiles").select("default_currency").eq("id", user.id).single(),
    supabase.from("asset_categories").select("id").eq("name", "Cash").maybeSingle(),
    getExchangeRatesFromUsd(),
  ]);
  const baseCurrency = currency || profile?.default_currency || DEFAULT_BASE_CURRENCY;
  if (!cashCategory) notFound();

  const { data: cash } = await supabase
    .from("assets")
    .select("id, name, currency, current_value, metadata, updated_at")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .eq("category_id", cashCategory.id)
    .eq("is_liability", false)
    .order("name")
    .returns<CashRow[]>();

  const { data: links } = await supabase
    .from("bank_account_links")
    .select("asset_id, masked_number, bank_connections(institution_name)")
    .eq("profile_id", user.id)
    .returns<LinkRow[]>();
  const linkByAsset = new Map((links ?? []).filter((l) => l.asset_id).map((l) => [l.asset_id as string, l]));

  const mine = (cash ?? []).filter((a) => {
    const profileId = typeof a.metadata?.bank_profile === "string" ? a.metadata.bank_profile : "";
    const institution = bankGroupName(
      linkByAsset.get(a.id)?.bank_connections?.institution_name ?? (institutionOfMetadata(a.metadata) || getBankProfile(profileId)?.name) ?? "",
    );
    return bankKey(institution) === bankKey(bankName);
  });
  if (mine.length === 0) notFound();

  const ids = mine.map((a) => a.id);
  const dateSources = await loadBalanceDateSources(supabase, ids);
  const today = new Date().toISOString().slice(0, 10);

  const accounts: BankDetailAccount[] = mine.map((a) => {
    const ref = typeof a.metadata?.account_ref === "string" ? a.metadata.account_ref : "";
    return {
      id: a.id,
      name: a.name,
      masked: linkByAsset.get(a.id)?.masked_number ?? (ref ? `••••${ref.replace(/[^0-9A-Za-z]/g, "").slice(-4)}` : ""),
      currency: a.currency,
      balance: a.current_value,
      baseBalance: convertToBaseCurrency(a.current_value, a.currency, baseCurrency, rates),
      balanceAsOf: pickBalanceDate({ ...dateSources.get(a.id), updatedAt: a.updated_at, statementThrough: typeof a.metadata?.statement_through === "string" ? a.metadata.statement_through : null }),
      closedOn: typeof a.metadata?.closed_on === "string" ? a.metadata.closed_on : null,
    };
  });

  let transactions: BankDetailTransaction[] = [];
  try {
    const { data } = await supabase
      .from("transactions")
      .select("asset_id, booked_date, amount, currency, description")
      .in("asset_id", ids)
      .order("booked_date", { ascending: false })
      .limit(MAX_TRANSACTIONS)
      .returns<{ asset_id: string; booked_date: string; amount: number | string; currency: string | null; description: string | null }[]>();
    transactions = (data ?? []).map((t) => ({
      accountId: t.asset_id,
      date: t.booked_date,
      amount: Number(t.amount),
      currency: t.currency || mine.find((a) => a.id === t.asset_id)?.currency || baseCurrency,
      description: t.description ?? "",
    }));
  } catch {
    // The transactions table may not exist in every environment: the balances still show.
  }

  return (
    <BankDetailView
      bankName={bankName}
      baseCurrency={baseCurrency}
      accounts={accounts}
      transactions={transactions}
      truncated={transactions.length >= MAX_TRANSACTIONS}
      today={today}
    />
  );
}
