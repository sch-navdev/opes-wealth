/**
 * Metadata for the "Companies" asset category — corporate entities and
 * business ownership you hold personally or through a holding company. Kept
 * separate from Private Equity (a passive fund commitment with capital calls)
 * and from personal assets: a Company is an operating or holding entity whose
 * equity you own a share of. Stored in `assets.metadata` (same jsonb pattern as
 * the other categories).
 *
 * Valuation: `company_value` is the equity value of 100% of the entity;
 * `assets.current_value` is YOUR stake = `company_value × ownership_percentage`.
 * `ownership_percentage` is your effective ECONOMIC share (look-through): if
 * you hold 100% of a holding company that owns 60% of an operating company,
 * enter 60 on the operating company.
 *
 * Avoiding double counting: if a company is held through a holding company that
 * you ALSO track as its own entry, value the holding company excluding that
 * subsidiary's stake — Net Worth sums every entry.
 */
export type CompanyEntityType =
  | "llc"
  | "ltd"
  | "corporation"
  | "partnership"
  | "sole_proprietorship"
  | "holding"
  | "other";

export const COMPANY_ENTITY_TYPES: CompanyEntityType[] = [
  "llc",
  "ltd",
  "corporation",
  "partnership",
  "sole_proprietorship",
  "holding",
  "other",
];

export type CompanyHeldVia = "personal" | "holding";

export type CompanyMetadata = {
  legal_name: string;
  entity_type: CompanyEntityType;
  jurisdiction: string;
  registration_number: string;
  industry: string;
  incorporation_date: string;
  /** Your role (shareholder, director, founder…) — free text. */
  role: string;
  /** Your effective economic ownership of this entity, in percent. */
  ownership_percentage: number | null;
  held_via: CompanyHeldVia;
  /** A tracked Company asset that sits between you and this entity (when `held_via` = holding). */
  holding_company_id: string;
  /** Name of the holding vehicle when it is not tracked as its own entry. */
  holding_name: string;
  /** Equity value of 100% of the entity (see the file header). */
  company_value: number | null;
  valuation_method: string;
  valuation_date: string;
};

export const EMPTY_COMPANY_METADATA: CompanyMetadata = {
  legal_name: "",
  entity_type: "llc",
  jurisdiction: "",
  registration_number: "",
  industry: "",
  incorporation_date: "",
  role: "",
  ownership_percentage: null,
  held_via: "personal",
  holding_company_id: "",
  holding_name: "",
  company_value: null,
  valuation_method: "",
  valuation_date: "",
};

export function parseCompanyMetadata(raw: unknown): CompanyMetadata {
  if (!raw || typeof raw !== "object") return EMPTY_COMPANY_METADATA;
  return { ...EMPTY_COMPANY_METADATA, ...(raw as Partial<CompanyMetadata>) };
}

/** Unmet requirements as translation keys. */
export function getCompanyMetadataErrors(metadata: CompanyMetadata): string[] {
  const errors: string[] = [];
  const pct = metadata.ownership_percentage;
  if (pct === null || Number.isNaN(pct)) errors.push("company_ownership_required");
  else if (pct < 0 || pct > 100) errors.push("ownership_percentage_range");
  return errors;
}

/** Your stake in the entity: equity value × ownership share. */
export function companyStakeValue(companyValue: number, ownershipPercentage: number | null): number {
  return (companyValue * (ownershipPercentage ?? 100)) / 100;
}

export type CompanyNode = {
  id: string;
  name: string;
  currency: string;
  stakeValue: number;
  metadata: CompanyMetadata;
  children: CompanyNode[];
};

export type HoldingStructure = {
  /** Entities held directly by you, or via a holding vehicle that isn't tracked — grouped by that vehicle's name. */
  personal: CompanyNode[];
  untrackedHoldings: { name: string; companies: CompanyNode[] }[];
  /** Tracked holding companies and everything held through them (a node's `children`). */
  roots: CompanyNode[];
};

/**
 * Builds the ownership structure: tracked holding companies become parents of
 * the entities pointing at them (`holding_company_id`), an untracked holding
 * vehicle named only by `holding_name` becomes a group, and everything else is
 * held personally.
 */
export function buildHoldingStructure(
  companies: { id: string; name: string; currency: string; current_value: number; metadata: unknown }[],
): HoldingStructure {
  const nodes = new Map<string, CompanyNode>(
    companies.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        currency: c.currency,
        stakeValue: c.current_value,
        metadata: parseCompanyMetadata(c.metadata),
        children: [],
      },
    ]),
  );

  const roots: CompanyNode[] = [];
  const personal: CompanyNode[] = [];
  const untracked = new Map<string, CompanyNode[]>();

  // child id -> parent id for edges attached so far; used to detect (and break) holding cycles.
  const attachedTo = new Map<string, string>();
  // Attaching `node` under `parent` would close a loop if `node` is already an ancestor of `parent`.
  const closesCycle = (node: CompanyNode, parent: CompanyNode): boolean => {
    for (let cur: string | undefined = parent.id; cur !== undefined; cur = attachedTo.get(cur)) {
      if (cur === node.id) return true;
    }
    return false;
  };

  for (const node of nodes.values()) {
    const md = node.metadata;
    const parent = md.held_via === "holding" ? nodes.get(md.holding_company_id) : undefined;
    // A cycle (x<->y, or longer) would make every member a child and drop them all from the
    // structure; the back-edge is ignored so the member that closes the loop is shown top-level.
    if (parent && !closesCycle(node, parent)) {
      attachedTo.set(node.id, parent.id);
      parent.children.push(node);
    } else if (md.held_via === "holding" && md.holding_name.trim()) {
      const key = md.holding_name.trim();
      untracked.set(key, [...(untracked.get(key) ?? []), node]);
    } else {
      personal.push(node);
    }
  }

  // A tracked holding company is a root only if it has subsidiaries listed under it.
  const personalOnly: CompanyNode[] = [];
  for (const node of personal) {
    if (node.children.length > 0) roots.push(node);
    else personalOnly.push(node);
  }

  return {
    personal: personalOnly,
    untrackedHoldings: Array.from(untracked, ([name, list]) => ({ name, companies: list })),
    roots,
  };
}
