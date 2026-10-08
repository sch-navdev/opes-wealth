/**
 * Structures & look-through: regroups the user's net worth by the legal
 * structures it sits in (trusts, foundations, holding companies, SPVs…).
 *
 * Inputs are the rows the Companies page already loads for every asset the user
 * can see (own + co-owned, ALREADY reduced to the user's co-ownership share by
 * `applyOwnershipFactors`), the FX table and the Base Currency.
 *
 * WHAT "VALUE" MEANS HERE: every amount is an asset's NET-WORTH CONTRIBUTION in
 * the Base Currency, computed exactly like the dashboard's Net Worth card:
 * `grossAssetValue` (market value for Real Estate, `current_value` otherwise; 0
 * for a liability row) minus `assetLiability` (a liability row's own value, a
 * property's linked-loan / off-plan balance, a fund's pending capital calls),
 * each converted with `convertToBaseCurrency`. So a liability is negative, a
 * mortgaged property shows its equity, and a Company shows your recorded stake
 * (`current_value` = equity value × ownership %). The sum of every row's value
 * is the dashboard's Net Worth (Total Assets − Total Liabilities).
 *
 * REPORTING LENS ONLY: nothing here changes a value or a total. It only says
 * under which entity each asset is shown:
 *  - an entity (a Companies asset) owns the assets listed in its metadata
 *    `held_asset_ids` (non-Company assets or liabilities) and its sub-entities
 *    (Companies whose `holding_company_id` points at it, built by
 *    `buildHoldingStructure`, which also breaks holding cycles);
 *  - look-through subtotal of an entity = its own recorded value + its linked
 *    holdings + its sub-entities' subtotals;
 *  - "held through structures" = every entity's own value + every linked
 *    holding; "held personally" = every other (non-Company, unlinked) asset;
 *    the two always add up to net worth.
 *
 * Link rules: entities are visited in tree order (depth-first; top-level
 * entities and siblings sorted by name, then id), so "first" is stable. An
 * asset linked by two entities stays with the first and a warning is raised; a
 * link to an id that is missing / not visible to the user, or to a Company (use
 * `holding_company_id` for nesting), is ignored with a warning. An entity with
 * BOTH a non-zero own value AND linked holdings gets an informational flag: if
 * its value already includes those assets, net worth counts them twice.
 */
import { buildHoldingStructure, type CompanyEntityType, type CompanyNode } from "@/lib/companies";
import { convertToBaseCurrency } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";

/** `asset_categories.name` of the entities. */
export const COMPANIES_CATEGORY = "Companies";

export type LookthroughAssetRow = {
  id: string;
  name: string;
  /** `asset_categories.name` ("Real Estate", "Liabilities", "Companies"…). */
  category: string;
  currency: string;
  /** Already share-scaled (the user's part of a co-owned asset). */
  current_value: number;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
};

export type LookthroughHolding = {
  id: string;
  name: string;
  category: string;
  currency: string;
  isLiability: boolean;
  /** Net-worth contribution in the asset's own currency (negative for a liability). */
  nativeValue: number;
  /** Net-worth contribution in the Base Currency (negative for a liability). */
  value: number;
};

export type LookthroughBreakdownRow = { category: string; value: number };

export type LookthroughEntity = {
  id: string;
  name: string;
  currency: string;
  entityType: CompanyEntityType;
  /** The recorded effective (look-through) economic ownership, in percent. */
  ownershipPercentage: number | null;
  /** Name of an untracked holding vehicle the entity is held via, if any. */
  viaName: string | null;
  /** 0 for a top-level entity. */
  depth: number;
  /** The entity's own recorded stake (its Companies asset), Base Currency. */
  ownValue: number;
  /** Linked non-Company assets and liabilities that this entity keeps (after conflict resolution). */
  holdings: LookthroughHolding[];
  holdingsValue: number;
  children: LookthroughEntity[];
  /** ownValue + holdingsValue + Σ children subtotals. */
  subtotal: number;
  /** The subtotal split by asset class (sums to `subtotal`), largest magnitude first; zero classes omitted. */
  breakdown: LookthroughBreakdownRow[];
  /** The ids stored on the entity (`held_asset_ids`, sanitised), including ones ignored by the rules. */
  linkedIds: string[];
  /** Non-zero own value AND linked holdings: the own value may already include them. */
  possibleDoubleCount: boolean;
};

export type LookthroughWarning =
  | {
      kind: "duplicate_link";
      assetId: string;
      assetName: string;
      /** The entity whose link was ignored. */
      entityId: string;
      entityName: string;
      /** The entity the asset stays with. */
      keptEntityId: string;
      keptEntityName: string;
    }
  | { kind: "missing_link"; assetId: string; entityId: string; entityName: string }
  | { kind: "company_link"; assetId: string; assetName: string; entityId: string; entityName: string };

export type EntityLookthrough = {
  baseCurrency: string;
  roots: LookthroughEntity[];
  entityCount: number;
  /** Σ entities' own values + Σ linked holdings. */
  heldThroughStructures: number;
  /** Σ every non-Company asset not linked to an entity. */
  heldPersonally: number;
  /** Σ every row's net-worth contribution: the dashboard's Net Worth. */
  netWorth: number;
  /** Linked asset id -> the entity that keeps it. */
  holderByAssetId: Record<string, string>;
  /** Every row's net-worth contribution, Base Currency. */
  valueByAssetId: Record<string, number>;
  warnings: LookthroughWarning[];
};

const asLiabilityInput = (row: LookthroughAssetRow) => ({
  current_value: row.current_value,
  is_liability: row.is_liability,
  metadata: row.metadata,
  asset_categories: { name: row.category },
});

/** Net-worth contribution in the asset's own currency: gross value (0 for a liability row) minus its debt. */
export function nativeNetWorthContribution(row: LookthroughAssetRow): number {
  const input = asLiabilityInput(row);
  return (row.is_liability ? 0 : grossAssetValue(input)) - assetLiability(input);
}

/**
 * Net-worth contribution in the Base Currency, exactly as the dashboard builds it
 * (gross and debt converted separately, then subtracted).
 */
export function netWorthContribution(
  row: LookthroughAssetRow,
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  const input = asLiabilityInput(row);
  const toBase = (n: number) => convertToBaseCurrency(n, row.currency, baseCurrency, rates);
  const gross = row.is_liability ? 0 : toBase(grossAssetValue(input));
  return gross - toBase(assetLiability(input));
}

const byNameThenId = (a: { name: string; id: string }, b: { name: string; id: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** One choice in the "Manage holdings" checklist: a non-Company asset or liability the user can see. */
export type HoldingOption = {
  id: string;
  name: string;
  category: string;
  isLiability: boolean;
  /** Net-worth contribution, Base Currency. */
  value: number;
  /** The entity currently keeping this asset in the look-through, if any. */
  holder: { id: string; name: string } | null;
};

/** The checklist for the "Manage holdings" dialog: every non-Company row, sorted by name, with its current holder. */
export function buildHoldingOptions(assets: LookthroughAssetRow[], lookthrough: EntityLookthrough): HoldingOption[] {
  const names = new Map(flattenEntities(lookthrough.roots).map((e) => [e.id, e.name]));
  return assets
    .filter((a) => a.category !== COMPANIES_CATEGORY)
    .sort(byNameThenId)
    .map((a) => {
      const holderId = lookthrough.holderByAssetId[a.id];
      return {
        id: a.id,
        name: a.name,
        category: a.category,
        isLiability: a.is_liability,
        value: lookthrough.valueByAssetId[a.id] ?? 0,
        holder: holderId ? { id: holderId, name: names.get(holderId) ?? "" } : null,
      };
    });
}

/** Every entity of the tree, depth-first (parents before their children). */
export function flattenEntities(roots: LookthroughEntity[]): LookthroughEntity[] {
  const out: LookthroughEntity[] = [];
  const walk = (e: LookthroughEntity) => {
    out.push(e);
    e.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

export function buildEntityLookthrough(input: {
  assets: LookthroughAssetRow[];
  baseCurrency: string;
  rates: Record<string, number>;
}): EntityLookthrough {
  const { baseCurrency, rates } = input;
  const assets = [...input.assets].sort(byNameThenId);
  const rowById = new Map(assets.map((a) => [a.id, a]));
  const valueById = new Map(assets.map((a) => [a.id, netWorthContribution(a, baseCurrency, rates)]));

  const companies = assets.filter((a) => a.category === COMPANIES_CATEGORY);
  const structure = buildHoldingStructure(companies);
  const topLevel: CompanyNode[] = [
    ...structure.roots,
    ...structure.personal,
    ...structure.untrackedHoldings.flatMap((g) => g.companies),
  ].sort(byNameThenId);

  // Pass 1, tree order: decide which entity keeps each linked asset.
  const warnings: LookthroughWarning[] = [];
  const keeper = new Map<string, CompanyNode>();
  const kept = new Map<string, string[]>(); // entity id -> asset ids it keeps, in stored order
  const resolve = (node: CompanyNode) => {
    const mine: string[] = [];
    for (const assetId of node.metadata.held_asset_ids) {
      const row = rowById.get(assetId);
      if (!row) {
        warnings.push({ kind: "missing_link", assetId, entityId: node.id, entityName: node.name });
      } else if (row.category === COMPANIES_CATEGORY) {
        warnings.push({ kind: "company_link", assetId, assetName: row.name, entityId: node.id, entityName: node.name });
      } else {
        const first = keeper.get(assetId);
        if (first) {
          warnings.push({
            kind: "duplicate_link",
            assetId,
            assetName: row.name,
            entityId: node.id,
            entityName: node.name,
            keptEntityId: first.id,
            keptEntityName: first.name,
          });
        } else {
          keeper.set(assetId, node);
          mine.push(assetId);
        }
      }
    }
    kept.set(node.id, mine);
    node.children.forEach(resolve);
  };
  topLevel.forEach(resolve);

  // Pass 2: values, subtotals and breakdowns, bottom-up.
  const build = (node: CompanyNode, depth: number): LookthroughEntity => {
    const md = node.metadata;
    const ownValue = valueById.get(node.id) ?? 0;
    const holdings: LookthroughHolding[] = (kept.get(node.id) ?? []).map((id) => {
      const row = rowById.get(id)!;
      return {
        id,
        name: row.name,
        category: row.category,
        currency: row.currency,
        isLiability: row.is_liability,
        nativeValue: nativeNetWorthContribution(row),
        value: valueById.get(id) ?? 0,
      };
    });
    const children = node.children.map((child) => build(child, depth + 1));
    const holdingsValue = holdings.reduce((s, h) => s + h.value, 0);
    const subtotal = ownValue + holdingsValue + children.reduce((s, c) => s + c.subtotal, 0);

    const classes = new Map<string, number>();
    const add = (category: string, value: number) => classes.set(category, (classes.get(category) ?? 0) + value);
    add(COMPANIES_CATEGORY, ownValue);
    for (const h of holdings) add(h.category, h.value);
    for (const c of children) for (const b of c.breakdown) add(b.category, b.value);
    const breakdown = [...classes]
      .filter(([, value]) => value !== 0)
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

    const viaName = md.held_via === "holding" && depth === 0 && md.holding_name.trim() ? md.holding_name.trim() : null;
    return {
      id: node.id,
      name: node.name,
      currency: node.currency,
      entityType: md.entity_type,
      ownershipPercentage: md.ownership_percentage,
      viaName,
      depth,
      ownValue,
      holdings,
      holdingsValue,
      children,
      subtotal,
      breakdown,
      linkedIds: md.held_asset_ids,
      possibleDoubleCount: ownValue !== 0 && holdings.length > 0,
    };
  };
  const roots = topLevel.map((node) => build(node, 0));

  let netWorth = 0;
  let heldPersonally = 0;
  for (const a of assets) {
    const value = valueById.get(a.id) ?? 0;
    netWorth += value;
    if (a.category !== COMPANIES_CATEGORY && !keeper.has(a.id)) heldPersonally += value;
  }
  const heldThroughStructures = roots.reduce((s, r) => s + r.subtotal, 0);

  return {
    baseCurrency,
    roots,
    entityCount: companies.length,
    heldThroughStructures,
    heldPersonally,
    netWorth,
    holderByAssetId: Object.fromEntries([...keeper].map(([assetId, node]) => [assetId, node.id])),
    valueByAssetId: Object.fromEntries(valueById),
    warnings,
  };
}
