import { describe, expect, it } from "vitest";
import { wioCardProfile } from "./wio-card";

const TEXT = [
  "Transactions",
  "DateRef. NumberDescriptionCard NumberAmount",
  "04/08/2026P787614044Spl valberg",
  "Rate:  (/)4.27AEDEUR",
  "****2847-1,083.95",
  "04/08/2026P787614044Foreign Exchange Fee****2847-21.67",
  "31/08/2026P1117019100Credit Repayment+1,000.00",
  "Account summary",
  "Balance From Last Statement500.00",
  "Purchases+1,083.95",
  "Interest+0.00",
  "Late payment fee+0.00",
  "Foreign exchange charges+21.67",
  "Payments and credits-1,000.00",
  "Closing balance (Total to pay)605.62",
  "CREDIT STATEMENT",
  "FROM  TO 05/08/202605/09/2026",
  "ACCOUNT NUMBER 3981887116",
  "Wio, PJSC. All Rights Reserved.",
].join("\n");

describe("wioCardProfile", () => {
  it("detects a Wio credit statement and nothing else", () => {
    expect(wioCardProfile.detect(TEXT)).toBe(true);
    expect(wioCardProfile.detect("ACCOUNT STATEMENT Wio Bank Summary of Accounts")).toBe(false);
  });

  it("reads the period, the account, signed rows and a card balance that reconciles", () => {
    const out = wioCardProfile.parse(TEXT);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const [a] = out.statement.accounts;
    expect(a.accountRef).toBe("3981887116");
    expect([a.periodStart, a.periodEnd]).toEqual(["2026-08-05", "2026-09-05"]);
    expect(a.transactions.map((t) => [t.date, t.description, t.amount, t.reference])).toEqual([
      ["2026-08-04", "Spl valberg", -1083.95, "P787614044"],
      ["2026-08-04", "Foreign Exchange Fee", -21.67, "P787614044"],
      ["2026-08-31", "Credit Repayment", 1000, "P1117019100"],
    ]);
    // The card balance is minus what is owed.
    expect([a.openingBalance, a.closingBalance]).toEqual([-500, -605.62]);
    expect(a.reconciliation.status).toBe("ok");
  });

  it("reads the summary when the figures come before their labels", () => {
    const flipped = TEXT.replace("Balance From Last Statement500.00", "500.00Balance from last statement").replace("Closing balance (Total to pay)605.62", "605.62Closing balance (Total to pay)");
    const out = wioCardProfile.parse(flipped);
    expect(out.ok && out.statement.accounts[0].reconciliation.status).toBe("ok");
  });
});
