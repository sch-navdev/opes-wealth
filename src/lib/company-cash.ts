/**
 * Company bank accounts: a Cash asset linked to one of the user's Company entities.
 *
 * Storage: `metadata.company_id` on the Cash asset (the id of the Company asset). No migration, and the
 * account stays in the Cash category, so statement import, history and balances work unchanged.
 *
 * Rules (decided with Steve):
 *  - A company's cash is separate from the company's value: a company can be sold excluding its cash and the
 *    cash stays with the owner. So company cash ROLLS UP INTO NET WORTH (every total, chart and history that
 *    sums all assets keeps including it) and there is NO double-counting switch.
 *  - It is NOT personal cash: the dashboard Cash card, the Cash allocation slice, the emergency-fund balances,
 *    the daily-expense average, the retirement starting-asset default and "liquid cash" for planning exclude it.
 *  - A link only counts while it resolves to a Company the user can see (`companyIds`): an orphan link (the
 *    company was deleted) falls back to a personal account, so the money never disappears from personal views.
 *  - The look-through (`entity-lookthrough.ts`) keeps a company account under its company; `company_id` wins over
 *    another entity's `held_asset_ids` entry for the same account.
 */

/** Metadata key holding the Company asset id. */
export const COMPANY_ID_KEY = "company_id";

/** Display category of a company account in the allocation, the charts and the net-worth breakdowns. */
export const COMPANY_CASH_CATEGORY = "Company cash";

/** The company id stored on an asset's metadata, trimmed; "" when absent or not a string. */
export function companyIdOf(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const raw = (metadata as Record<string, unknown>)[COMPANY_ID_KEY];
  return typeof raw === "string" ? raw.trim() : "";
}

export type CompanyCashCandidate = {
  is_liability?: boolean | null;
  metadata?: unknown;
  asset_categories?: { name: string } | null;
};

/**
 * The ids of the Company assets among `assets` for callers whose rows may not carry an id (older fixtures):
 * undefined when no row has one, meaning "any non-empty company_id counts" (see `isCompanyAccount`).
 */
export function companyIdsOf(
  assets: { id?: string; asset_categories?: { name: string } | null }[],
): Set<string> | undefined {
  if (!assets.some((a) => typeof a.id === "string")) return undefined;
  return new Set(
    assets.filter((a) => a.asset_categories?.name === "Companies" && a.id).map((a) => a.id as string),
  );
}

/** The ids of the Company assets among `assets` (category "Companies"). */
export function companyIdSet(
  assets: { id: string; asset_categories?: { name: string } | null }[],
): Set<string> {
  return new Set(assets.filter((a) => a.asset_categories?.name === "Companies").map((a) => a.id));
}

/**
 * True when the asset is a (non-liability) Cash account linked to a company. With `companyIds` the link must
 * resolve to one of those ids; without it any non-empty `company_id` counts.
 */
export function isCompanyAccount(asset: CompanyCashCandidate, companyIds?: ReadonlySet<string>): boolean {
  if (asset.asset_categories?.name !== "Cash" || asset.is_liability) return false;
  const id = companyIdOf(asset.metadata);
  if (!id) return false;
  return companyIds ? companyIds.has(id) : true;
}

/** The linked company's id for a company account, else null. */
export function companyAccountOwner(asset: CompanyCashCandidate, companyIds?: ReadonlySet<string>): string | null {
  return isCompanyAccount(asset, companyIds) ? companyIdOf(asset.metadata) : null;
}

/**
 * The category an asset is shown under in allocations / charts: "Company cash" for a company account, the
 * stored category name otherwise. Totals are unaffected (only the label of the slice changes).
 */
export function displayCategory(asset: CompanyCashCandidate, companyIds?: ReadonlySet<string>): string {
  return isCompanyAccount(asset, companyIds) ? COMPANY_CASH_CATEGORY : (asset.asset_categories?.name ?? "—");
}

/** Splits cash accounts into the personal ones and those of each company (id -> accounts). */
export function splitCashByCompany<T extends CompanyCashCandidate>(
  assets: T[],
  companyIds?: ReadonlySet<string>,
): { personal: T[]; byCompany: Map<string, T[]> } {
  const personal: T[] = [];
  const byCompany = new Map<string, T[]>();
  for (const asset of assets) {
    if (asset.asset_categories?.name !== "Cash" || asset.is_liability) continue;
    const owner = companyAccountOwner(asset, companyIds);
    if (owner) byCompany.set(owner, [...(byCompany.get(owner) ?? []), asset]);
    else personal.push(asset);
  }
  return { personal, byCompany };
}

/** Sum of `amountOf` over the company accounts of `assets` (the personal ones are left out). */
export function sumCompanyCash<T extends CompanyCashCandidate>(
  assets: T[],
  amountOf: (asset: T) => number,
  companyIds?: ReadonlySet<string>,
): number {
  return assets.reduce((sum, a) => (isCompanyAccount(a, companyIds) ? sum + amountOf(a) : sum), 0);
}

/** Sum of `amountOf` over the PERSONAL cash accounts of `assets`. */
export function sumPersonalCash<T extends CompanyCashCandidate>(
  assets: T[],
  amountOf: (asset: T) => number,
  companyIds?: ReadonlySet<string>,
): number {
  return assets.reduce(
    (sum, a) =>
      a.asset_categories?.name === "Cash" && !a.is_liability && !isCompanyAccount(a, companyIds)
        ? sum + amountOf(a)
        : sum,
    0,
  );
}

/** Metadata with the company link set (a non-empty id) or removed (null / ""); every other key is kept. */
export function withCompanyId(metadata: unknown, companyId: string | null): Record<string, unknown> {
  const base: Record<string, unknown> =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const id = (companyId ?? "").trim();
  if (id) base[COMPANY_ID_KEY] = id;
  else delete base[COMPANY_ID_KEY];
  return base;
}
