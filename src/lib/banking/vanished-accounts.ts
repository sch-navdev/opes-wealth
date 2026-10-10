/**
 * Accounts that closed WITHOUT a statement saying so. A statement that lists every account of the customer (Wio's
 * "Summary of Accounts / of Savings" includes the ones with no activity) proves that an account missing from it is
 * gone: if it was in an earlier statement and is absent from a later one, it was closed in between. The closure
 * date is the last day an earlier statement covered it (the day it was moved to its replacement, for a renewed
 * space). Pure.
 */
export type ListingStatement = {
  fileId: number;
  profileId: string;
  /** ISO end of the statement period. */
  periodEnd: string;
  /** The statement lists EVERY account the customer has at that date, active or not. */
  listsAll: boolean;
  /** Account numbers / IBANs it mentions (with or without transactions). */
  refs: string[];
};

/** Keyed `<fileId>:<ref>`: the closure date for the account as it appears in that file (its last appearance). */
export function impliedClosures(statements: ListingStatement[]): Map<string, string> {
  const out = new Map<string, string>();
  const byProfile = new Map<string, ListingStatement[]>();
  for (const s of statements) byProfile.set(s.profileId, [...(byProfile.get(s.profileId) ?? []), s]);

  for (const list of byProfile.values()) {
    const listings = list.filter((s) => s.listsAll);
    if (listings.length === 0) continue;
    const last = new Map<string, ListingStatement>();
    for (const s of list) {
      for (const ref of s.refs) {
        const cur = last.get(ref);
        if (!cur || s.periodEnd > cur.periodEnd) last.set(ref, s);
      }
    }
    for (const [ref, seen] of last) {
      const gone = listings.some((l) => l.periodEnd > seen.periodEnd && !l.refs.includes(ref));
      if (gone) out.set(`${seen.fileId}:${ref}`, seen.periodEnd);
    }
  }
  return out;
}

export type KnownAccount = {
  id: string;
  ref: string;
  profileId: string;
  /** Newest date the account has a balance or statement for (ISO); null when unknown. */
  lastDate: string | null;
  closedOn?: string | null;
};

/**
 * Accounts already saved that none of the statements in the batch mention, although a later all-accounts statement
 * exists: they closed, on the last date Opes has for them. Returns account id -> closure date.
 */
export function absentAccountClosures(statements: ListingStatement[], accounts: KnownAccount[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of accounts) {
    if (a.closedOn || !a.ref || !a.lastDate) continue;
    const same = statements.filter((s) => s.profileId === a.profileId);
    if (same.some((s) => s.refs.includes(a.ref))) continue; // handled with the statements that mention it
    if (same.some((s) => s.listsAll && s.periodEnd > (a.lastDate as string))) out.set(a.id, a.lastDate);
  }
  return out;
}
