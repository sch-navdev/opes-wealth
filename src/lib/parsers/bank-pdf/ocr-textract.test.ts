import { describe, expect, it } from "vitest";
import { textractToOcrPage, type TextractBlockLike } from "./ocr-textract";

const word = (id: string, text: string): TextractBlockLike => ({ Id: id, BlockType: "WORD", Text: text });
const cell = (id: string, r: number, c: number, kids: string[], extra: Partial<TextractBlockLike> = {}): TextractBlockLike => ({
  Id: id,
  BlockType: "CELL",
  RowIndex: r,
  ColumnIndex: c,
  Relationships: kids.length ? [{ Type: "CHILD", Ids: kids }] : undefined,
  ...extra,
});
const line = (id: string, text: string, top?: number, left = 0.1): TextractBlockLike => ({
  Id: id,
  BlockType: "LINE",
  Text: text,
  ...(top === undefined ? {} : { Geometry: { BoundingBox: { Top: top, Left: left } } }),
});

describe("textractToOcrPage", () => {
  it("keeps block order when there is no geometry", () => {
    const page = textractToOcrPage([{ Id: "p", BlockType: "PAGE" }, line("l1", "Second?"), line("l2", "First?")]);
    expect(page.lines).toEqual(["Second?", "First?"]);
    expect(page.tables).toEqual([]);
  });

  it("orders lines top-to-bottom, then left-to-right within a row tolerance", () => {
    const page = textractToOcrPage([
      line("a", "bottom", 0.8),
      line("b", "right", 0.2005, 0.6),
      line("c", "left", 0.2, 0.1),
      line("d", "top", 0.05),
    ]);
    expect(page.lines).toEqual(["top", "left", "right", "bottom"]);
  });

  it("builds a table from CELL/WORD blocks, joins words, ignores selection elements", () => {
    const blocks: TextractBlockLike[] = [
      word("w1", "Date"),
      word("w2", "Balance"),
      word("w3", "01/02/2026"),
      word("w4", "1,000.00"),
      { Id: "s1", BlockType: "SELECTION_ELEMENT" },
      word("w5", "Cash"),
      word("w6", "deposit"),
      cell("c1", 1, 1, ["w1"]),
      cell("c2", 1, 2, ["w2"]),
      cell("c3", 2, 1, ["w3", "s1"]),
      cell("c4", 2, 2, ["w4"]),
      cell("c5", 3, 1, ["w5", "w6"]),
      cell("c6", 3, 2, []),
      { Id: "t1", BlockType: "TABLE", Relationships: [{ Type: "CHILD", Ids: ["c4", "c1", "c3", "c2", "c5", "c6"] }] },
    ];
    const page = textractToOcrPage(blocks);
    expect(page.tables).toHaveLength(1);
    expect(page.tables[0].rows).toEqual([
      ["Date", "Balance"],
      ["01/02/2026", "1,000.00"],
      ["Cash deposit", ""],
    ]);
  });

  it("pads rows and handles spanning cells (text in the top-left slot)", () => {
    const blocks: TextractBlockLike[] = [
      word("w1", "Header"),
      word("w2", "x"),
      word("w3", "y"),
      cell("c1", 1, 1, ["w1"], { ColumnSpan: 3 }),
      cell("c2", 2, 1, ["w2"]),
      cell("c3", 2, 3, ["w3"]),
      { Id: "t1", BlockType: "TABLE", Relationships: [{ Type: "CHILD", Ids: ["c1", "c2", "c3"] }] },
      { Id: "m1", BlockType: "MERGED_CELL", RowIndex: 1, ColumnIndex: 1 },
    ];
    expect(textractToOcrPage(blocks).tables[0].rows).toEqual([
      ["Header", "", ""],
      ["x", "", "y"],
    ]);
  });

  it("skips empty tables and blank lines", () => {
    const page = textractToOcrPage([
      line("l1", "   "),
      { Id: "t1", BlockType: "TABLE", Relationships: [{ Type: "CHILD", Ids: [] }] },
    ]);
    expect(page).toEqual({ lines: [], tables: [] });
  });
});
