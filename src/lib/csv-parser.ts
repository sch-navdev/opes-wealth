/**
 * Minimal RFC 4180 CSV parser — no external dependency. Handles quoted
 * fields (including embedded commas, newlines, and escaped `""` quotes),
 * CRLF/LF line endings, and a trailing newline at end of file. Not a
 * general-purpose CSV library — just enough to read a bank-exported file.
 */
export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsv(text: string, delimiter = ","): ParsedCsv {
  const table = parseCsvRows(text, delimiter);
  if (table.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = table[0].map((h) => h.trim());
  const rows = table.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/** The raw table (every row, header included) with a configurable delimiter — French banks export semicolon-separated files. */
export function parseCsvTable(text: string, delimiter = ","): string[][] {
  return parseCsvRows(text, delimiter);
}

function parseCsvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize CRLF up front so the loop only has to think about \n.
  const input = text.replace(/\r\n/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Flush the last field/row if the file doesn't end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-blank trailing rows (a common artifact of a trailing newline).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
