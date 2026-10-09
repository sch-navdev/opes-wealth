import {
  getPrivateEquityMetadataErrors,
  isValidIsoDay,
  type ActualDistribution,
  type CapitalCall,
  type PrivateEquityMetadata,
} from "@/lib/private-equity";

/**
 * Pure edit operations for the private-equity cash-flow ledger editor: PAID capital calls (with `paid_date`)
 * and dated ACTUAL distributions, stored inside `assets.metadata` (no table). Each operation returns the next
 * metadata or a validation code (the keys of lib/private-equity.ts' error codes), never throws, never mutates.
 * Pending calls and projections are left untouched: they belong to the fund form.
 */

export type LedgerRow =
  | { type: "call"; id: string; date: string; amount: number }
  | { type: "distribution"; id: string; date: string; amount: number; kind: ActualDistribution["kind"] };

export type LedgerResult = { ok: true; metadata: PrivateEquityMetadata } | { ok: false; code: string };

/** Codes of the full-metadata validator that a ledger edit can cause (other codes concern the rest of the form). */
const LEDGER_CODES = new Set([
  "pe_paid_date_invalid",
  "pe_ledger_too_long",
  "pe_actual_distribution_invalid",
  "pe_call_invalid",
  "pe_calls_exceed_commitment",
]);

const callDay = (c: CapitalCall) => (c.paid_date && isValidIsoDay(c.paid_date) ? c.paid_date : c.due_date);
const byDate = (a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Paid calls and actual distributions as one list, oldest first. */
export function ledgerRows(md: PrivateEquityMetadata): LedgerRow[] {
  const calls: LedgerRow[] = md.capital_calls
    .filter((c) => c.status === "paid")
    .map((c) => ({ type: "call" as const, id: c.id, date: callDay(c), amount: c.amount }));
  const dists: LedgerRow[] = md.distributions.map((d) => ({
    type: "distribution" as const,
    id: d.id,
    date: d.date,
    amount: d.amount,
    kind: d.kind,
  }));
  return [...calls, ...dists].sort(byDate);
}

const newId = (prefix: string, date: string) => `${prefix}-${date}-${Math.random().toString(36).slice(2, 8)}`;

const pct = (amount: number, commitment: number | null) =>
  commitment != null && commitment > 0 ? Math.round((amount / commitment) * 10000) / 100 : 0;

function validate(next: PrivateEquityMetadata): LedgerResult {
  const code = getPrivateEquityMetadataErrors(next).find((c) => LEDGER_CODES.has(c));
  return code ? { ok: false, code } : { ok: true, metadata: next };
}

const validCall = (date: string, amount: number): string | null =>
  !isValidIsoDay(date) ? "pe_paid_date_invalid" : !(Number.isFinite(amount) && amount > 0) ? "pe_call_invalid" : null;

const validDist = (date: string, amount: number): string | null =>
  !isValidIsoDay(date) || !(Number.isFinite(amount) && amount > 0) ? "pe_actual_distribution_invalid" : null;

/** Adds a paid call (due date = paid date, since the schedule did not know about it). */
export function addPaidCall(md: PrivateEquityMetadata, input: { date: string; amount: number }): LedgerResult {
  const bad = validCall(input.date, input.amount);
  if (bad) return { ok: false, code: bad };
  const call: CapitalCall = {
    id: newId("call", input.date),
    due_date: input.date,
    paid_date: input.date,
    amount: input.amount,
    percentage: pct(input.amount, md.commitment_amount),
    status: "paid",
  };
  return validate({ ...md, capital_calls: [...md.capital_calls, call] });
}

/** Changes the paid date and amount of a paid call; its scheduled due date is kept. */
export function updatePaidCall(md: PrivateEquityMetadata, id: string, input: { date: string; amount: number }): LedgerResult {
  const bad = validCall(input.date, input.amount);
  if (bad) return { ok: false, code: bad };
  return validate({
    ...md,
    capital_calls: md.capital_calls.map((c) =>
      c.id === id && c.status === "paid"
        ? { ...c, paid_date: input.date, amount: input.amount, percentage: pct(input.amount, md.commitment_amount) }
        : c,
    ),
  });
}

export function removePaidCall(md: PrivateEquityMetadata, id: string): LedgerResult {
  // Removing a row cannot introduce an error, so it is never blocked by problems already in the data.
  return { ok: true, metadata: { ...md, capital_calls: md.capital_calls.filter((c) => !(c.id === id && c.status === "paid")) } };
}

export function addDistribution(
  md: PrivateEquityMetadata,
  input: { date: string; amount: number; kind: ActualDistribution["kind"] },
): LedgerResult {
  const bad = validDist(input.date, input.amount);
  if (bad) return { ok: false, code: bad };
  const row: ActualDistribution = { id: newId("dist", input.date), date: input.date, amount: input.amount, kind: input.kind };
  return validate({ ...md, distributions: [...md.distributions, row].sort(byDate) });
}

export function updateDistribution(
  md: PrivateEquityMetadata,
  id: string,
  input: { date: string; amount: number; kind: ActualDistribution["kind"] },
): LedgerResult {
  const bad = validDist(input.date, input.amount);
  if (bad) return { ok: false, code: bad };
  return validate({
    ...md,
    distributions: md.distributions.map((d) => (d.id === id ? { ...d, ...input } : d)).sort(byDate),
  });
}

export function removeDistribution(md: PrivateEquityMetadata, id: string): LedgerResult {
  return { ok: true, metadata: { ...md, distributions: md.distributions.filter((d) => d.id !== id) } };
}
