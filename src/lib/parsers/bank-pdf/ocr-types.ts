/**
 * Provider-neutral shape of an OCR'd PDF, as consumed by the bank statement parsers.
 * Produced by `ocr-textract.ts` from AWS Textract blocks; the parsers never see Textract types.
 */
export type OcrTable = {
  /** Rows of cell texts, padded to the table's column count. */
  rows: string[][];
};

/** One OCR text block with its position, normalised to the page (0..1, origin top-left). */
export type OcrBox = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  page?: number;
};

export type OcrPage = {
  /** Text lines in reading order. */
  lines: string[];
  tables: OcrTable[];
  /**
   * Optional geometry of the same text blocks (Textract LINE blocks). One visual line may be split into
   * several boxes, or neighbours merged, in any order: parsers rebuild visual rows from the positions.
   * Absent for synthetic documents and providers without geometry.
   */
  boxes?: OcrBox[];
};

export type OcrDocument = {
  pages: OcrPage[];
};
