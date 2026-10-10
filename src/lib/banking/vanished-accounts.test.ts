import { describe, expect, it } from "vitest";
import { absentAccountClosures, impliedClosures, type ListingStatement } from "./vanished-accounts";

const st = (fileId: number, periodEnd: string, refs: string[], listsAll = true): ListingStatement => ({ fileId, profileId: "wio", periodEnd, listsAll, refs });

describe("impliedClosures", () => {
  it("closes an account on the last day a statement covered it when a later full listing no longer has it", () => {
    const out = impliedClosures([st(1, "2026-02-26", ["BIGDAY", "CURRENT"]), st(2, "2026-03-31", ["CURRENT", "NEWDAY"])]);
    expect(out.get("1:BIGDAY")).toBe("2026-02-26");
    expect(out.has("1:CURRENT")).toBe(false);
    expect(out.has("2:NEWDAY")).toBe(false);
  });
  it("does nothing without a later statement that lists every account", () => {
    expect(impliedClosures([st(1, "2026-02-26", ["A"]), st(2, "2026-03-31", [], false)]).size).toBe(0);
    expect(impliedClosures([st(1, "2026-02-26", ["A"])]).size).toBe(0);
  });
  it("keeps accounts that reappear, and never mixes banks", () => {
    const other = { ...st(3, "2026-04-30", ["ZZZ"]), profileId: "hsbc_uae" };
    const out = impliedClosures([st(1, "2026-02-26", ["A"]), st(2, "2026-03-31", ["A"]), other]);
    expect(out.size).toBe(0);
  });
});

describe("absentAccountClosures", () => {
  const acc = { id: "x", ref: "BIGDAY", profileId: "wio", lastDate: "2026-02-26" };
  it("closes a saved account that a later full statement no longer lists, on its last date", () => {
    expect(absentAccountClosures([st(2, "2026-03-31", ["CURRENT"])], [acc]).get("x")).toBe("2026-02-26");
  });
  it("leaves it alone when the statement is not newer, lists it, or the account is closed already", () => {
    expect(absentAccountClosures([st(2, "2026-02-20", ["CURRENT"])], [acc]).size).toBe(0);
    expect(absentAccountClosures([st(2, "2026-03-31", ["BIGDAY"])], [acc]).size).toBe(0);
    expect(absentAccountClosures([st(2, "2026-03-31", [])], [{ ...acc, closedOn: "2026-02-26" }]).size).toBe(0);
    expect(absentAccountClosures([st(2, "2026-03-31", [], false)], [acc]).size).toBe(0);
  });
});
