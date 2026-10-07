/**
 * Adapter: AWS Textract `Block[]` (one page, from AnalyzeDocument with TABLES) -> `OcrPage`.
 *
 * Pure and I/O-free. Uses a structural block type (a subset of the SDK's `Block`) so it can be
 * tested with hand-built arrays shaped like Textract's JSON.
 *
 *  - LINE blocks become `lines`, in reading order by `Geometry.BoundingBox` (top then left, with a
 *    small vertical tolerance so columns of one visual row stay together) when every line has one,
 *    otherwise in block order.
 *  - TABLE blocks become `tables`: CELL children (RowIndex/ColumnIndex are 1-based) are placed in a
 *    grid padded to the table's column count. A cell spanning several rows/columns puts its text in
 *    the top-left slot and leaves the covered slots empty. Cell text = its WORD children joined by
 *    spaces (SELECTION_ELEMENT children are ignored). MERGED_CELL blocks are ignored (their CELL
 *    children carry the content).
 */
import type { OcrPage, OcrTable } from "./ocr-types";

export type TextractBlockLike = {
  Id?: string;
  BlockType?: string;
  Text?: string;
  RowIndex?: number;
  ColumnIndex?: number;
  RowSpan?: number;
  ColumnSpan?: number;
  Geometry?: { BoundingBox?: { Top?: number; Left?: number; Width?: number; Height?: number } };
  Relationships?: { Type?: string; Ids?: string[] }[];
};

const LINE_TOLERANCE = 0.006;

function childIds(block: TextractBlockLike): string[] {
  return (block.Relationships ?? []).filter((r) => r.Type === "CHILD").flatMap((r) => r.Ids ?? []);
}

function cellText(cell: TextractBlockLike, byId: Map<string, TextractBlockLike>): string {
  const parts: string[] = [];
  for (const id of childIds(cell)) {
    const child = byId.get(id);
    if (!child) continue;
    if (child.BlockType === "WORD" || child.BlockType === "LINE") {
      if (child.Text) parts.push(child.Text);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function tableOf(table: TextractBlockLike, byId: Map<string, TextractBlockLike>): OcrTable | null {
  const cells = childIds(table)
    .map((id) => byId.get(id))
    .filter((b): b is TextractBlockLike => !!b && b.BlockType === "CELL" && !!b.RowIndex && !!b.ColumnIndex);
  if (cells.length === 0) return null;

  let rowCount = 0;
  let colCount = 0;
  for (const c of cells) {
    rowCount = Math.max(rowCount, (c.RowIndex ?? 1) + (c.RowSpan ?? 1) - 1);
    colCount = Math.max(colCount, (c.ColumnIndex ?? 1) + (c.ColumnSpan ?? 1) - 1);
  }
  const rows: string[][] = Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => ""));
  for (const c of cells) {
    const text = cellText(c, byId);
    const r = (c.RowIndex ?? 1) - 1;
    const col = (c.ColumnIndex ?? 1) - 1;
    rows[r][col] = rows[r][col] ? `${rows[r][col]} ${text}`.trim() : text;
  }
  return { rows };
}

export function textractToOcrPage(blocks: readonly TextractBlockLike[]): OcrPage {
  const byId = new Map<string, TextractBlockLike>();
  for (const b of blocks) if (b.Id) byId.set(b.Id, b);

  const lineBlocks = blocks.filter((b) => b.BlockType === "LINE" && typeof b.Text === "string" && b.Text.trim() !== "");
  const allGeometry = lineBlocks.length > 0 && lineBlocks.every((b) => b.Geometry?.BoundingBox?.Top !== undefined);
  const ordered = allGeometry
    ? lineBlocks
        .map((b, i) => ({ b, i }))
        .sort((x, y) => {
          const tx = x.b.Geometry?.BoundingBox?.Top ?? 0;
          const ty = y.b.Geometry?.BoundingBox?.Top ?? 0;
          if (Math.abs(tx - ty) > LINE_TOLERANCE) return tx - ty;
          const lx = x.b.Geometry?.BoundingBox?.Left ?? 0;
          const ly = y.b.Geometry?.BoundingBox?.Left ?? 0;
          return lx !== ly ? lx - ly : x.i - y.i;
        })
        .map((e) => e.b)
    : lineBlocks;
  const lines = ordered.map((b) => (b.Text ?? "").replace(/\s+/g, " ").trim());

  const tables: OcrTable[] = [];
  for (const b of blocks) {
    if (b.BlockType !== "TABLE") continue;
    const t = tableOf(b, byId);
    if (t) tables.push(t);
  }
  return { lines, tables };
}
