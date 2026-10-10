import { describe, expect, it } from "vitest";
import { currentRef, findCardChains, findRolloverChains, mergeRefHistory, parseRefHistory } from "@/lib/banking/rollover";

describe("findRolloverChains", () => {
  it("joins a savings space closed and reopened the same day, oldest first (the Wio 'Papa Fixed Saving Space' case)", () => {
    const chains = findRolloverChains([
      { key: "c", ref: "2884871877", name: "Papa Fixed Saving Space", openedOn: "2026-09-23" },
      { key: "a", ref: "2801366317", name: "Papa Fixed Saving Space", openedOn: "2026-08-24", closedOn: "2026-09-23" },
      { key: "b", ref: "2684141353", name: "Papa Fixed Saving Space", openedOn: "2026-09-23", closedOn: "2026-09-23" },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].keys).toEqual(["a", "b", "c"]);
    expect(chains[0].refs).toEqual(["2801366317", "2684141353", "2884871877"]);
  });

  it("does not join accounts that merely share a name, or a gap of more than a day", () => {
    expect(
      findRolloverChains([
        { key: "a", ref: "1", name: "Fixed Saving Space", openedOn: "2026-01-01", closedOn: "2026-02-01" },
        { key: "b", ref: "2", name: "Fixed Saving Space", openedOn: "2026-03-01" },
      ]),
    ).toEqual([]);
  });

  it("keeps two different names as two chains and ignores unnamed accounts", () => {
    const chains = findRolloverChains([
      { key: "a1", ref: "1", name: "Papa", openedOn: "2026-01-01", closedOn: "2026-02-01" },
      { key: "a2", ref: "2", name: "papa ", openedOn: "2026-02-01" },
      { key: "b1", ref: "3", name: "Mama", openedOn: "2026-01-01", closedOn: "2026-02-01" },
      { key: "b2", ref: "4", name: "Mama", openedOn: "2026-02-02" },
      { key: "x", ref: "5", openedOn: "2026-02-01", closedOn: "2026-02-01" },
    ]);
    expect(chains.map((c) => c.keys)).toEqual([["a1", "a2"], ["b1", "b2"]]);
  });
});

describe("ref history", () => {
  it("merges periods per ref and the most recent statement date decides the current ref", () => {
    const merged = mergeRefHistory(
      [{ ref: "CB 1234", from: "2025-01-10", to: "2025-12-31" }],
      [
        { ref: "CB 5609", from: "2026-01-10", to: "2026-07-30" },
        { ref: "CB 1234", from: "2024-06-01", to: "2025-11-30" },
      ],
    );
    expect(merged).toEqual([
      { ref: "CB 1234", from: "2024-06-01", to: "2025-12-31" },
      { ref: "CB 5609", from: "2026-01-10", to: "2026-07-30" },
    ]);
    expect(currentRef(merged)).toBe("CB 5609");
    // Importing an OLDER statement of the old card later does not make it current again.
    expect(currentRef(mergeRefHistory(merged, [{ ref: "CB 1234", from: "2023-01-01", to: "2023-02-01" }]))).toBe("CB 5609");
  });

  it("ignores malformed stored history", () => {
    expect(parseRefHistory([{ ref: "A", from: "2026-01-01", to: null }, { nope: 1 }, "x", null])).toEqual([{ ref: "A", from: "2026-01-01", to: null }]);
    expect(parseRefHistory("x")).toEqual([]);
    expect(currentRef([])).toBeNull();
  });
});

describe("findCardChains", () => {
  const m = (key: string, ref: string, periodEnd: string, parentRef = "31719621257") => ({ key, ref, parentRef, profileId: "banque_populaire_card", currency: "EUR", periodEnd });
  it("chains cards settled on the same account, oldest statement first, the latest card last", () => {
    const chains = findCardChains([m("c", "CB 5609", "2026-09-10"), m("a", "CB 7592", "2026-01-02"), m("b", "CB 7592", "2026-05-11"), m("d", "CB 5609", "2026-07-10")]);
    expect(chains).toHaveLength(1);
    expect(chains[0].keys).toEqual(["a", "b", "d", "c"]);
    expect(chains[0].refs).toEqual(["CB 7592", "CB 5609"]);
  });
  it("does not chain one card, or cards of different accounts", () => {
    expect(findCardChains([m("a", "CB 7592", "2026-01-02"), m("b", "CB 7592", "2026-02-10")])).toEqual([]);
    expect(findCardChains([m("a", "CB 7592", "2026-01-02", "111111"), m("b", "CB 5609", "2026-07-10", "222222")])).toEqual([]);
  });
});

describe("findRolloverChains: name variants and repeated accounts", () => {
  it("treats the same name in another case or word order as the same space (Papa Fixed Saving Space)", () => {
    const chains = findRolloverChains([
      { key: "a", ref: "1", name: "Papa Fixed Saving Space", openedOn: "2026-07-25", closedOn: "2026-08-24" },
      { key: "b", ref: "2", name: "Fixed Saving Space PAPA", openedOn: "2026-08-24", closedOn: "2026-08-24" },
      { key: "c", ref: "3", name: "Fixed Saving Space Papa", openedOn: "2026-08-24" },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].refs).toEqual(["1", "2", "3"]);
  });

  it("keeps a space with another name apart, even when it is closed the same day", () => {
    const chains = findRolloverChains([
      { key: "a", ref: "1", name: "Fixed Saving Space", openedOn: "2026-02-01", closedOn: "2026-02-21" },
      { key: "b", ref: "2", name: "Fixed Saving Space Papa", openedOn: "2026-02-21" },
    ]);
    expect(chains).toEqual([]);
  });

  it("follows one account across the several statements it appears in", () => {
    const chains = findRolloverChains([
      { key: "aug:3", ref: "3", name: "Papa Fixed Saving Space", openedOn: "2026-08-24" },
      { key: "sep:0", ref: "3", name: "Papa Fixed Saving Space", openedOn: "2026-08-24", closedOn: "2026-09-23" },
      { key: "aug:1", ref: "1", name: "Papa Fixed Saving Space", openedOn: "2026-07-25", closedOn: "2026-08-24" },
      { key: "sep:1", ref: "4", name: "Papa Fixed Saving Space", openedOn: "2026-09-23" },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].refs).toEqual(["1", "3", "4"]);
    expect([...chains[0].keys].sort()).toEqual(["aug:1", "aug:3", "sep:0", "sep:1"]);
  });
});
