/**
 * Provider-neutral shape of an OCR'd PDF, as consumed by the bank statement parsers.
 * Produced by `ocr-textract.ts` from AWS Textract blocks; the parsers never see Textract types.
 */
export type OcrTable = {
  /** Rows of cell texts, padded to the table's column count. */
  rows: string[][];
};

export type OcrPage = {
  /** Text lines in reading order. */
  lines: string[];
  tables: OcrTable[];
};

export type OcrDocument = {
  pages: OcrPage[];
};
