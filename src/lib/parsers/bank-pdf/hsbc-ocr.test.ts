/**
 * OCR route of the HSBC UAE profile: SYNTHETIC statements (invented names, numbers and amounts) laid out
 * like the real "Composite Statement" page (columns Date | Transaction Details | Deposits | Withdrawals |
 * Balance, amounts right-aligned). No real Textract output has been used.
 */
import { describe, expect, it } from "vitest";
import { hsbcProfile } from "./hsbc";
import { parseBankStatementOcr } from "./index";
import type { OcrBox, OcrDocument, OcrPage } from "./ocr-types";
import type { PdfAccountStatement, PdfParseOutcome } from "./types";

const CW = 0.0065;
const IBAN1 = "AE070331234567890123456";
const IBAN2 = "AE070331234567890123999";

type Item =
  | "header"
  | { text: string; left?: number } // free text
  | { date?: string; desc?: string; dep?: string; wd?: string; bal?: string };

function bx(text: string, left: number, y: number): OcrBox {
  return { text, left, right: left + text.length * CW, top: y - 0.006, bottom: y + 0.006 };
}
const rbx = (text: string, right: number, y: number) => bx(text, right - text.length * CW, y);

function layoutPage(items: Item[], opts: { merge?: boolean } = {}): OcrPage {
  const boxes: OcrBox[] = [];
  const lines: string[] = [];
  let y = 0.1;
  for (const it of items) {
    y += 0.02;
    if (it === "header") {
      boxes.push(bx("Date", 0.088, y), bx("Transaction Details", 0.18, y), rbx("Deposits", 0.58, y), rbx("Withdrawals", 0.695, y), rbx("Balance", 0.83, y));
      lines.push("Date Transaction Details Deposits Withdrawals Balance");
      continue;
    }
    if ("text" in it) {
      boxes.push(bx(it.text, it.left ?? 0.07, y));
      lines.push(it.text);
      continue;
    }
    if (it.date) boxes.push(bx(it.date, 0.075, y));
    if (it.desc) boxes.push(bx(it.desc, 0.18, y));
    const amt = it.dep ?? it.wd;
    if (opts.merge && amt && it.bal) {
      // One Textract block holding "amount balance": it spans the amount and balance columns.
      const left = (it.dep ? 0.578 : 0.713) - amt.length * CW;
      boxes.push({ text: `${amt} ${it.bal}`, left, right: 0.813, top: y - 0.006, bottom: y + 0.006 });
    } else {
      if (it.dep) boxes.push(rbx(it.dep, 0.578, y));
      if (it.wd) boxes.push(rbx(it.wd, 0.713, y));
      if (it.bal) boxes.push(rbx(it.bal, 0.813, y));
    }
    lines.push([it.date, it.desc, it.dep, it.wd, it.bal].filter(Boolean).join(" "));
  }
  return { lines, tables: [], boxes };
}

const top = (stmtDate = "22SEP2026"): Item[] => [
  { text: "HSBC" },
  { text: "Composite Statement" },
  { text: `STATEMENT DATE ${stmtDate}`, left: 0.55 },
];
const title = (num: string, iban: string, name = "CURRENT ACCOUNT"): Item => ({ text: `${name} ${num} IBAN - ${iban}` });
const doc = (...pages: OcrPage[]): OcrDocument => ({ pages });
function ok(out: PdfParseOutcome) {
  expect(out.ok).toBe(true);
  if (!out.ok) throw new Error(out.failure.message);
  return out.statement;
}
const brief = (a: PdfAccountStatement) => a.transactions.map((t) => [t.date, t.amount, t.balance, t.reference]);
const real = (warnings: string[]) => warnings.filter((w) => !w.startsWith("OCR read"));

function simpleMonth(opts: { sumWd?: string; counts?: [string, string]; closing?: string } = {}): Item[] {
  return [
    ...top(),
    title("001-123456-001", IBAN1),
    "header",
    { desc: "AED" },
    { date: "01Feb2026", desc: "BALANCE BROUGHT FORWARD", bal: "1,000.00" },
    { date: "02Feb2026", desc: "FAKE SHOP ONE" },
    { desc: "Card Purchase" },
    { desc: "REF AAA-0001", wd: "100.00", bal: "900.00" },
    { desc: "FAKE UTILITY" },
    { desc: "REF AAA-0002", wd: "50.00", bal: "850.00" },
    { date: "05Feb2026", desc: "SALARY FAKE CO" },
    { desc: "REF AAA-0003", dep: "2,000.00", bal: "2,850.00" },
    { desc: "CLOSING BALANCE", bal: opts.closing ?? "2,850.00" },
    { desc: "Transaction Summary", dep: "2,000.00", wd: opts.sumWd ?? "150.00" },
    { desc: "Transaction Count", dep: opts.counts?.[0] ?? "1", wd: opts.counts?.[1] ?? "2" },
  ];
}

const THREE = [
  ["2026-02-02", -100, 900, "AAA-0001"],
  ["2026-02-02", -50, 850, "AAA-0002"],
  ["2026-02-05", 2000, 2850, "AAA-0003"],
];

describe("hsbcProfile OCR (geometry)", () => {
  it("(a) reads a simple month; a date shown only on the first transaction of a day is carried forward", () => {
    const s = ok(hsbcProfile.parseOcr!(doc(layoutPage(simpleMonth()))));
    expect(s.bank).toBe("hsbc_uae");
    expect(s.source).toBe("ocr");
    expect(s.accounts).toHaveLength(1);
    const a = s.accounts[0];
    expect(a.accountRef).toBe(IBAN1);
    expect(a.currency).toBe("AED");
    expect(brief(a)).toEqual(THREE);
    expect(a.transactions[0].description).toBe("FAKE SHOP ONE Card Purchase");
    expect(a.transactions[0].valueDate).toBeNull();
    expect(a.openingBalance).toBe(1000);
    expect(a.closingBalance).toBe(2850);
    expect(a.periodStart).toBe("2026-02-02");
    expect(a.reconciliation.status).toBe("ok");
    expect(real(s.warnings)).toEqual([]);
  });

  it("(b) joins a transaction split across pages; repeated undated B/F and C/F are not transactions", () => {
    const page1 = layoutPage([
      ...top(),
      title("001-123456-001", IBAN1),
      "header",
      { desc: "AED" },
      { date: "01Feb2026", desc: "BALANCE BROUGHT FORWARD", bal: "1,000.00" },
      { date: "02Feb2026", desc: "FIRST SHOP" },
      { desc: "REF AAA-0001", wd: "100.00", bal: "900.00" },
      { date: "10Feb2026", desc: "PART ONE TEXT" },
      { desc: "MORE TEXT" },
      { desc: "BALANCE CARRIED FORWARD", bal: "900.00" },
    ]);
    const page2 = layoutPage([
      ...top(),
      title("001-123456-001", IBAN1),
      "header",
      { desc: "BALANCE BROUGHT FORWARD", bal: "900.00" },
      { desc: "REST OF TEXT" },
      { desc: "REF BBB-0002", wd: "400.00", bal: "500.00" },
      { desc: "CLOSING BALANCE", bal: "500.00" },
      { desc: "Transaction Summary", dep: "0.00", wd: "500.00" },
      { desc: "Transaction Count", dep: "0", wd: "2" },
    ]);
    const s = ok(hsbcProfile.parseOcr!(doc(page1, page2)));
    expect(s.accounts).toHaveLength(1);
    const a = s.accounts[0];
    expect(brief(a)).toEqual([
      ["2026-02-02", -100, 900, "AAA-0001"],
      ["2026-02-10", -400, 500, "BBB-0002"],
    ]);
    expect(a.transactions[1].description).toBe("PART ONE TEXT MORE TEXT REST OF TEXT");
    expect(a.openingBalance).toBe(1000);
    expect(a.reconciliation.status).toBe("ok");
    expect(real(s.warnings)).toEqual([]);
  });

  it("(c) reads two accounts in different currencies; a zero-movement account is kept without failing the statement", () => {
    const s = ok(
      hsbcProfile.parseOcr!(
        doc(
          layoutPage([
            ...simpleMonth(),
            title("001-123456-100", IBAN2),
            "header",
            { desc: "EUR" },
            { date: "01Feb2026", desc: "BALANCE BROUGHT FORWARD", bal: "75.50" },
            { desc: "CLOSING BALANCE", bal: "75.50" },
            { desc: "Transaction Summary", dep: "0.00", wd: "0.00" },
            { desc: "Transaction Count", dep: "0", wd: "0" },
          ]),
        ),
      ),
    );
    expect(s.accounts.map((a) => [a.accountRef, a.currency, a.transactions.length])).toEqual([
      [IBAN1, "AED", 3],
      [IBAN2, "EUR", 0],
    ]);
    expect(s.accounts[1].reconciliation.status).toBe("ok");
    expect(s.accounts[1].openingBalance).toBe(75.5);
    expect(s.accounts[1].periodEnd).toBe("2026-09-22");
  });

  it("(c2) a statement whose accounts all have zero movements is ok with a warning, not no_transactions", () => {
    const s = ok(
      hsbcProfile.parseOcr!(
        doc(
          layoutPage([
            ...top(),
            title("001-123456-001", IBAN1),
            "header",
            { desc: "AED" },
            { date: "01Feb2026", desc: "BALANCE BROUGHT FORWARD", bal: "10.00" },
            { desc: "CLOSING BALANCE", bal: "10.00" },
            { desc: "Transaction Summary", dep: "0.00", wd: "0.00" },
            { desc: "Transaction Count", dep: "0", wd: "0" },
          ]),
        ),
      ),
    );
    expect(s.accounts[0].transactions).toEqual([]);
    expect(s.warnings.some((w) => w.includes("No transactions"))).toBe(true);
  });

  it("(c3) fails with no_transactions when the printed count says there are movements but none were read", () => {
    const out = hsbcProfile.parseOcr!(
      doc(
        layoutPage([
          ...top(),
          title("001-123456-001", IBAN1),
          "header",
          { desc: "AED" },
          { date: "01Feb2026", desc: "BALANCE BROUGHT FORWARD", bal: "10.00" },
          { desc: "CLOSING BALANCE", bal: "40.00" },
          { desc: "Transaction Summary", dep: "30.00", wd: "0.00" },
          { desc: "Transaction Count", dep: "1", wd: "0" },
        ]),
      ),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.code).toBe("no_transactions");
  });

  it("(d) a quiet month with an equal deposit and withdrawal nets to zero and reconciles", () => {
    const s = ok(
      hsbcProfile.parseOcr!(
        doc(
          layoutPage([
            ...top(),
            title("001-123456-001", IBAN1),
            "header",
            { desc: "AED" },
            { date: "21Feb2026", desc: "BALANCE BROUGHT FORWARD", bal: "3,000.00" },
            { date: "24Feb2026", desc: "FAKE INCOMING" },
            { desc: "REF CCC-0001", dep: "1,300.00", bal: "4,300.00" },
            { desc: "FAKE OUTGOING" },
            { desc: "REF CCC-0002", wd: "1,300.00", bal: "3,000.00" },
            { desc: "CLOSING BALANCE", bal: "3,000.00" },
            { desc: "Transaction Summary", dep: "1,300.00", wd: "1,300.00" },
            { desc: "Transaction Count", dep: "1", wd: "1" },
          ]),
        ),
      ),
    );
    const a = s.accounts[0];
    expect(a.transactions.map((t) => t.amount)).toEqual([1300, -1300]);
    expect(a.transactions.map((t) => t.date)).toEqual(["2026-02-24", "2026-02-24"]);
    expect(a.reconciliation.status).toBe("ok");
    expect(real(s.warnings)).toEqual([]);
  });

  it("(e) rebuilds rows from shuffled, split and merged Textract fragments", () => {
    const page = layoutPage(simpleMonth(), { merge: true });
    // Split multi-word description boxes in two, jitter y a little, reverse the order. The "amount balance"
    // boxes stay merged (as Textract can return them).
    const frag: OcrBox[] = [];
    page.boxes!.forEach((b, i) => {
      const jitter = i % 2 ? 0.0015 : -0.0015;
      const sp = b.text.indexOf(" ");
      if (sp < 0 || /^[\d,.]+ [\d,.]+$/.test(b.text)) {
        frag.push({ ...b, top: b.top + jitter, bottom: b.bottom + jitter });
        return;
      }
      const cut = b.left + (sp / b.text.length) * (b.right - b.left);
      frag.push({ ...b, text: b.text.slice(0, sp), right: cut, top: b.top + jitter, bottom: b.bottom + jitter });
      frag.push({ ...b, text: b.text.slice(sp + 1), left: cut, top: b.top - jitter, bottom: b.bottom - jitter });
    });
    frag.reverse();
    const s = ok(hsbcProfile.parseOcr!(doc({ lines: page.lines, tables: [], boxes: frag })));
    const a = s.accounts[0];
    expect(brief(a)).toEqual(THREE);
    expect(a.transactions[0].description).toBe("FAKE SHOP ONE Card Purchase");
    expect(a.reconciliation.status).toBe("ok");
  });

  it("(e2) boxes delivered in reverse reading order are still read", () => {
    const page = layoutPage(simpleMonth());
    page.boxes = [...page.boxes!].reverse();
    const s = ok(hsbcProfile.parseOcr!(doc(page)));
    expect(brief(s.accounts[0])).toEqual(THREE);
  });

  it("(f) reads DR balances as negative and warns", () => {
    const s = ok(
      hsbcProfile.parseOcr!(
        doc(
          layoutPage([
            ...top(),
            title("001-123456-001", IBAN1),
            "header",
            { desc: "AED" },
            { date: "01Feb2026", desc: "BALANCE BROUGHT FORWARD", bal: "500.00" },
            { date: "03Feb2026", desc: "FAKE BIG PURCHASE" },
            { desc: "REF DDD-0001", wd: "800.00", bal: "300.00DR" },
            { desc: "CLOSING BALANCE", bal: "300.00DR" },
            { desc: "Transaction Summary", dep: "0.00", wd: "800.00" },
            { desc: "Transaction Count", dep: "0", wd: "1" },
          ]),
        ),
      ),
    );
    const a = s.accounts[0];
    expect(a.transactions[0].amount).toBe(-800);
    expect(a.transactions[0].balance).toBe(-300);
    expect(a.closingBalance).toBe(-300);
    expect(a.reconciliation.status).toBe("ok");
    expect(s.warnings.some((w) => w.includes("DR"))).toBe(true);
  });

  it("(g) printed totals that disagree give warnings, not a throw; a wrong closing balance gives mismatch", () => {
    const s = ok(hsbcProfile.parseOcr!(doc(layoutPage(simpleMonth({ sumWd: "999.00", counts: ["1", "1"] })))));
    expect(s.accounts[0].reconciliation.status).toBe("ok");
    expect(s.warnings.some((w) => w.includes("differ from the printed Transaction Summary"))).toBe(true);
    expect(s.warnings.some((w) => w.includes("Transaction count"))).toBe(true);

    const bad = ok(hsbcProfile.parseOcr!(doc(layoutPage(simpleMonth({ closing: "2,800.00" })))));
    expect(bad.accounts[0].reconciliation.status).toBe("mismatch");
    expect(bad.warnings.some((w) => w.includes("Reconciliation mismatch"))).toBe(true);
  });

  it("is reached through parseBankStatementOcr with geometry only (no lines)", () => {
    const page = layoutPage(simpleMonth());
    const s = ok(parseBankStatementOcr({ pages: [{ lines: [], tables: [], boxes: page.boxes }] }));
    expect(s.accounts[0].transactions).toHaveLength(3);
  });
});

describe("hsbcProfile OCR (lines only fallback)", () => {
  const head = [
    "HSBC",
    "Composite Statement",
    "STATEMENT DATE 22SEP2026",
    `CURRENT ACCOUNT 001-123456-001 IBAN - ${IBAN1}`,
    "Date Transaction Details Deposits Withdrawals Balance (DR=Debit)",
    "AED",
    "01Feb2026 BALANCE BROUGHT FORWARD 1,000.00",
  ];
  const tail = ["CLOSING BALANCE 850.00", "Transaction Summary 0.00 150.00", "Transaction Count 0 2"];

  it("(h) reads one-line REF rows and carries the date forward", () => {
    const lines = [...head, "02Feb2026 FAKE SHOP ONE", "Card Purchase", "REF AAA-0001 100.00 900.00", "FAKE UTILITY", "REF AAA-0002 50.00 850.00", ...tail];
    const s = ok(hsbcProfile.parseOcr!(doc({ lines, tables: [] })));
    const a = s.accounts[0];
    expect(brief(a)).toEqual([
      ["2026-02-02", -100, 900, "AAA-0001"],
      ["2026-02-02", -50, 850, "AAA-0002"],
    ]);
    expect(a.transactions[0].description).toBe("FAKE SHOP ONE Card Purchase");
    expect(a.currency).toBe("AED");
    expect(a.reconciliation.status).toBe("ok");
    expect(real(s.warnings)).toEqual([]);
  });

  it("(h) accepts amounts printed on their own line after the REF line", () => {
    const lines = [...head, "02Feb2026 FAKE SHOP ONE", "REF AAA-0001", "100.00 900.00", "FAKE UTILITY", "REF AAA-0002", "50.00 850.00", ...tail];
    const s = ok(hsbcProfile.parseOcr!(doc({ lines, tables: [] })));
    expect(brief(s.accounts[0])).toEqual([
      ["2026-02-02", -100, 900, "AAA-0001"],
      ["2026-02-02", -50, 850, "AAA-0002"],
    ]);
    expect(s.accounts[0].reconciliation.status).toBe("ok");
  });

  it("keeps FX text inside the description (its amount is not a transaction amount)", () => {
    const lines = [...head, "02Feb2026 TO 012-079646-001", "FX AED 400.00", "AT 0.2382282", "REF AAA-0001 100.00 900.00", "REF AAA-0002 50.00 850.00", ...tail];
    const s = ok(hsbcProfile.parseOcr!(doc({ lines, tables: [] })));
    expect(s.accounts[0].transactions).toHaveLength(2);
    expect(s.accounts[0].transactions[0].description).toBe("TO 012-079646-001 FX AED 400.00 AT 0.2382282");
  });
});

describe("hsbcProfile.detectOcr", () => {
  it("is false for a non-HSBC document and true for the composite layout", () => {
    expect(hsbcProfile.detectOcr!({ pages: [{ lines: ["Another Bank", "Statement", "Totals"], tables: [] }] })).toBe(false);
    expect(hsbcProfile.detectOcr!({ pages: [{ lines: ["Another Bank", "Composite Statement", "Transaction Details"], tables: [] }] })).toBe(false);
    expect(hsbcProfile.detectOcr!(doc(layoutPage(simpleMonth())))).toBe(true);
  });

  it("recognises the composite layout even when the logo is not read as text", () => {
    const page = layoutPage(simpleMonth());
    page.lines = page.lines.filter((l) => l !== "HSBC");
    expect(hsbcProfile.detectOcr!(doc(page))).toBe(true);
  });
});

describe("hsbcProfile OCR: every account of the summary table is accounted for", () => {
  it("names the product from the block title and says so when a summary account has no readable details block", () => {
    const page = layoutPage([
      ...top(),
      { text: "Summary of Your Portfolio" },
      { text: "CURRENT ACCOUNT AED 001-123456-001 2,850.00 2,850.00" },
      { text: "EUR 001-123456-100 120.50 480.20" },
      ...simpleMonth().slice(3),
      // (simpleMonth already starts with `top`; its first three items are the statement header lines)
    ].filter((it, i, all) => !(typeof it === "object" && "text" in it && it.text === "HSBC" && all.indexOf(it) !== i)));
    const s = ok(hsbcProfile.parseOcr!(doc(page)));
    expect(s.accounts).toHaveLength(1);
    expect(s.accounts[0].accountName).toBe("Current account");
    const missing = s.warnings.filter((w) => w.includes("001-123456-100"));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("NOT imported");
    expect(s.warnings.some((w) => w.includes("001-123456-001"))).toBe(false);
  });
});
