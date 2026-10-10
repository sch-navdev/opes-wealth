/**
 * Accounts that are really ONE account renewed: a fixed savings space is closed and reopened the same day
 * under the same name and a new account number (to add the interest to the working capital), and a bank card is
 * replaced by another with new digits. Pure helpers: finding the chains, and the ref history kept on the
 * single account that results ("old card ...1234 ran from X to Y, same account").
 */

export type RolloverMember = {
  /** Caller's key for the account group (e.g. "fileId:groupIndex"). */
  key: string;
  ref: string;
  /** Printed name of the space; groups without a name never chain. */
  name?: string;
  openedOn?: string;
  closedOn?: string;
};

export type RolloverChain = {
  /** Display name of the chain (the printed name of its members). */
  name: string;
  /** Member keys, oldest account first. */
  keys: string[];
  refs: string[];
};

const normalName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/** The closing and the reopening happened the same day (or the next one: the bank books it overnight). */
function renews(prev: RolloverMember, next: RolloverMember): boolean {
  if (!prev.closedOn || !next.openedOn) return false;
  const gap = dayNumber(next.openedOn) - dayNumber(prev.closedOn);
  return Number.isFinite(gap) && gap >= 0 && gap <= 1;
}

/**
 * Chains of two or more accounts with the same printed name where each was closed the day the next one was
 * opened. An account that is still open ends its chain; two unrelated accounts that share a name (no matching
 * dates) are never joined.
 */
export function findRolloverChains(members: RolloverMember[]): RolloverChain[] {
  const byName = new Map<string, RolloverMember[]>();
  for (const m of members) {
    if (!m.name) continue;
    const k = normalName(m.name);
    byName.set(k, [...(byName.get(k) ?? []), m]);
  }
  const chains: RolloverChain[] = [];
  for (const list of byName.values()) {
    const sorted = [...list].sort(
      (a, b) => (a.openedOn ?? "").localeCompare(b.openedOn ?? "") || (a.closedOn ?? "9999").localeCompare(b.closedOn ?? "9999"),
    );
    const used = new Set<string>();
    for (const start of sorted) {
      if (used.has(start.key)) continue;
      const chain = [start];
      let tail = start;
      for (;;) {
        const next = sorted.find((m) => !used.has(m.key) && m.key !== tail.key && !chain.includes(m) && renews(tail, m));
        if (!next) break;
        chain.push(next);
        tail = next;
      }
      if (chain.length >= 2) {
        chain.forEach((m) => used.add(m.key));
        chains.push({ name: start.name as string, keys: chain.map((m) => m.key), refs: chain.map((m) => m.ref) });
      }
    }
  }
  return chains;
}

export type CardMember = {
  key: string;
  ref: string;
  /** Account the card is settled on, as printed. */
  parentRef?: string;
  profileId: string;
  currency: string;
  /** Statement date: the most recent one belongs to the current card. */
  periodEnd?: string | null;
};

/**
 * Cards settled on the SAME account (same bank layout and currency) under different card numbers are one card that
 * was replaced. Every statement group of those cards joins one chain, oldest statement first; the last one is the
 * current card.
 */
export function findCardChains(members: CardMember[]): RolloverChain[] {
  const byParent = new Map<string, CardMember[]>();
  for (const m of members) {
    if (!m.parentRef || !m.ref || !m.profileId) continue;
    const k = [m.profileId, m.parentRef, m.currency.toUpperCase()].join("|");
    byParent.set(k, [...(byParent.get(k) ?? []), m]);
  }
  const chains: RolloverChain[] = [];
  for (const list of byParent.values()) {
    const sorted = [...list].sort((a, b) => (a.periodEnd ?? "").localeCompare(b.periodEnd ?? ""));
    const refs: string[] = [];
    for (const m of sorted) if (!refs.includes(m.ref)) refs.push(m.ref);
    if (refs.length >= 2) chains.push({ name: "", keys: sorted.map((m) => m.key), refs });
  }
  return chains;
}

/** One period during which an account number / card number belonged to the account. */
export type RefHistoryEntry = { ref: string; from: string | null; to: string | null };

/** Reads `metadata.ref_history`, ignoring anything malformed. */
export function parseRefHistory(value: unknown): RefHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: RefHistoryEntry[] = [];
  for (const v of value) {
    if (typeof v !== "object" || v === null) continue;
    const r = v as Record<string, unknown>;
    if (typeof r.ref !== "string" || !r.ref) continue;
    out.push({
      ref: r.ref,
      from: typeof r.from === "string" ? r.from : null,
      to: typeof r.to === "string" ? r.to : null,
    });
  }
  return out;
}

/** Adds periods to a history: the same ref widens its dates (earliest from, latest to). Oldest period first. */
export function mergeRefHistory(existing: RefHistoryEntry[], incoming: RefHistoryEntry[]): RefHistoryEntry[] {
  const map = new Map<string, RefHistoryEntry>();
  for (const e of [...existing, ...incoming]) {
    const cur = map.get(e.ref);
    if (!cur) {
      map.set(e.ref, { ...e });
      continue;
    }
    cur.from = [cur.from, e.from].filter((x): x is string => !!x).sort()[0] ?? null;
    cur.to = [cur.to, e.to].filter((x): x is string => !!x).sort().reverse()[0] ?? null;
  }
  return [...map.values()].sort((a, b) => (a.from ?? "").localeCompare(b.from ?? "") || (a.to ?? "").localeCompare(b.to ?? ""));
}

/**
 * The ref currently in use: the one whose period ends latest (the most recent statement date decides which
 * card is the current one). Ties and missing dates keep the later entry of the sorted history.
 */
export function currentRef(history: RefHistoryEntry[]): string | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => (a.to ?? "").localeCompare(b.to ?? "") || (a.from ?? "").localeCompare(b.from ?? ""));
  return sorted[sorted.length - 1].ref;
}
