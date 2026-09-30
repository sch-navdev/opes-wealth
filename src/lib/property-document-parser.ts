import type { Emirate, RealEstateMetadata } from "@/lib/real-estate";

/**
 * Pure text parsers for the standard UAE real-estate documents a property
 * owner accumulates (Abu Dhabi off-plan SPA / title deed, Dubai title deed /
 * Form F / Oqood / DLD receipt). Modelled on `lib/tenancy-parser.ts`: each
 * parser takes the raw `pdf-parse` text of one document and returns `null`
 * for every field it can't find, so a partially readable export still yields
 * whatever it does contain (see `hasAnyExtractedField`).
 *
 * VERIFICATION STATUS — every parser below was built against REAL exports
 * pulled with the repo's `pdf-parse` (not just label names in isolation):
 *
 * - `abu_dhabi_offplan_spa`  : real Aldar "Off-Plan Unit Sale and Purchase
 *   Agreement" (Manarat Living III, unit 104) — project, unit, area, price OK.
 * - `abu_dhabi_title_deed`   : real ADREC e-title deed (Al Bandar, unit 303;
 *   area 124.10, owner STEVE CHRISTOPHER HARO). Older scanned (image-only)
 *   deeds have no text layer and cannot be parsed — all fields come back null.
 * - `dubai_title_deed`       : real DLD title deed (Ellington House 1, unit
 *   713; area 121; owner + purchase price 3,400,000).
 * - `dubai_form_f`           : real Unified Sell Contract (F) exports (Saba
 *   Tower 3 / 2707: sell price 1,550,000; and Jumeirah Park A25). The Saba
 *   export has a broken font map — every glyph is shifted by -29 codepoints
 *   (see `repairShiftedGlyphs`) — and is handled.
 * - `dubai_oqood`            : real Oqood "Initial Contract of Sale" (Eltiera
 *   Heights 807; value 2,029,828).
 * - `dubai_dld_receipt`      : real DLD receipts (Eltiera Heights 807: 40,617
 *   "Sell - Pre registration"; Ellington House 713: 68,020 "Sale"). A second
 *   Ellington receipt (68,560, title-deed issuance + map fees) sits in the
 *   same PDF and is NOT parsed (first receipt only); its label shapes were
 *   inspected but that parse path is unexercised.
 *
 * Caveat shared by all: only the formats seen are covered; a DLD/ADREC layout
 * change (or a villa/land variant whose rows differ from the apartment
 * samples) can shift fields to null rather than produce wrong values — the
 * regexes are anchored on labels, never on absolute positions, except where a
 * comment says otherwise (Dubai title deed `property_number`).
 *
 * The Arabic in these PDFs is either real Unicode (ADREC, Aldar SPA) or a
 * Latin-adjacent mangled codepoint run (DLD). Either way the English label /
 * value runs are plain ASCII, so the extractors isolate ASCII runs and ignore
 * anything above U+007F.
 */

export type PropertyDocumentType =
  | "abu_dhabi_offplan_spa"
  | "abu_dhabi_title_deed"
  | "dubai_title_deed"
  | "dubai_form_f"
  | "dubai_oqood"
  | "dubai_dld_receipt";

export type ParsedAbuDhabiOffplanSpa = {
  type: "abu_dhabi_offplan_spa";
  project_name: string | null;
  unit_number: string | null;
  /** Total unit area (internal + balcony/terrace), sq.m. */
  area_sqm: number | null;
  internal_area_sqm: number | null;
  balcony_area_sqm: number | null;
  /** Unit purchase price, AED. */
  price: number | null;
  plot_number: string | null;
  /** ADREC registered project number (e.g. `20250000424792`). */
  project_number: string | null;
  estimated_completion_date: string | null; // ISO YYYY-MM-DD
};

export type ParsedAbuDhabiTitleDeed = {
  type: "abu_dhabi_title_deed";
  unit_number: string | null;
  area_sqm: number | null;
  owner_names: string[];
  project_name: string | null;
  plot_number: string | null;
  application_date: string | null; // ISO YYYY-MM-DD
};

export type ParsedDubaiTitleDeed = {
  type: "dubai_title_deed";
  property_number: string | null;
  area_sqm: number | null;
  /** Internal ("Suite") area, sq.m. */
  suite_area_sqm: number | null;
  balcony_area_sqm: number | null;
  owner_names: string[];
  building_name: string | null;
  /** Certificate / title deed number, e.g. `712132/2025`. */
  title_deed_number: string | null;
  /** Amount of the registered purchase ("for the amount N Dirham"), AED. */
  purchase_price: number | null;
  issue_date: string | null; // ISO YYYY-MM-DD
};

export type ParsedDubaiFormF = {
  type: "dubai_form_f";
  sell_price: number | null;
  deposit_amount: number | null;
  seller_names: string[];
  buyer_names: string[];
  contract_number: string | null;
  title_deed_number: string | null;
  start_date: string | null; // ISO YYYY-MM-DD
};

export type ParsedDubaiOqood = {
  type: "dubai_oqood";
  project_name: string | null;
  unit_number: string | null;
  /** Net sold area, sq.m. */
  area_sqm: number | null;
  /** Property value, AED. */
  value: number | null;
  contract_number: string | null;
  contract_date: string | null; // ISO YYYY-MM-DD
};

export type ParsedDubaiDldReceipt = {
  type: "dubai_dld_receipt";
  /** Total fees paid on the receipt, AED. */
  payment_amount: number | null;
  procedure_type: string | null;
  procedure_date: string | null; // ISO YYYY-MM-DD
  payer_name: string | null;
  unit_number: string | null;
  building_name: string | null;
  registration_fee: number | null;
  knowledge_fee: number | null;
  innovation_fee: number | null;
  title_deed_fee: number | null;
  map_fee: number | null;
};

export type ParsedPropertyDocument =
  | ParsedAbuDhabiOffplanSpa
  | ParsedAbuDhabiTitleDeed
  | ParsedDubaiTitleDeed
  | ParsedDubaiFormF
  | ParsedDubaiOqood
  | ParsedDubaiDldReceipt;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** First capture group of `pattern` against the raw text, or `null`. */
function firstMatch(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1] ?? null;
}

/** Strips currency codes and thousands separators from a matched amount/area string (e.g. `"AED 3,980,915.00"` -> `3980915`). */
function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Normalizes `DD/MM/YYYY`, `DD-MM-YYYY` and `YYYY/MM/DD` (ADREC) to `YYYY-MM-DD`. Returns `null` if it can't confidently parse. */
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  const iso = t.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    if (Number(m) > 12 || Number(d) > 31) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dmy = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    if (Number(m) > 12 || Number(d) > 31) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** `"ELTIERA HEIGHTS"` -> `"Eltiera Heights"`; mixed-case input is returned untouched. */
function titleCaseIfUpper(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** The trimmed line directly above the first line matching `label`, or `null`. */
function lineBefore(lines: string[], label: RegExp): string | null {
  const idx = lines.findIndex((l) => label.test(l));
  return idx > 0 ? lines[idx - 1] : null;
}

/** Some DLD Form F exports embed a font whose glyphs are offset by -29 codepoints (`"6HOOHU\u00031DPH"` is "Seller Name", `\u0003` is a space, `\u0014` is "1"). Detects that signature and shifts the ASCII-range control/low characters back; real text and the Arabic glyphs (all > U+007F) are left untouched. No-op for every normally encoded export. */
function repairShiftedGlyphs(text: string): string {
  if (!/6HOOHU\u00031DPH|%X\\HU\u00031DPH|6HOO\u00033ULFH/.test(text)) return text;
  if (/Seller Name|Sell Price/.test(text)) return text;
  return text.replace(/[\x01-\x5d]/g, (c) =>
    c === "\n" || c === "\r" ? c : String.fromCharCode(c.charCodeAt(0) + 29),
  );
}

function normalizeText(text: string): string {
  return repairShiftedGlyphs(text.replace(/ /g, " "));
}

/** Pushes `name` unless an equivalent (case/space-insensitive) one is already there. */
function pushUnique(names: string[], name: string): void {
  const key = name.replace(/\s+/g, " ").trim().toUpperCase();
  if (!key) return;
  if (!names.some((n) => n.toUpperCase() === key)) names.push(name.replace(/\s+/g, " ").trim());
}

// ---------------------------------------------------------------------------
// Abu Dhabi — off-plan Sale & Purchase Agreement (Aldar / ADREC standard form)
// ---------------------------------------------------------------------------

/**
 * Abu Dhabi off-plan SPA — verified against a real Aldar export. The form is
 * a bilingual two-column table, extracted as either one line
 * (`<Arabic label> * <Arabic value> <English value> <English label> *`) or as
 * `<value>` on the line directly ABOVE its English label:
 *
 * ```
 * اسم المشروع * منارة ليفنج 3 Manarat Living III Project Name *
 * 104
 * Unit No.  *
 * (Sq.m)142.88
 * Unit Total Area  *
 * سعر الوحدة بالأرقام (درهم) * 3,980,915.00 Unit Price in Numbers
 * ```
 *
 * so inline values are read with `value + English label` patterns and
 * stacked values with `lineBefore`. The unit area line may put the unit
 * before or after the number (`(Sq.m)142.88` vs `125.64 (Sq.m)`), so only
 * the digits are read.
 */
export function parseAbuDhabiOffplanSpa(text: string): ParsedAbuDhabiOffplanSpa {
  const t = normalizeText(text);
  const lines = toLines(t);

  const projectRaw = firstMatch(t, /([A-Za-z][A-Za-z0-9 '&.-]*?)\s*Project Name\s*\*/);
  const unitLine = lineBefore(lines, /^Unit No\.?\s*\*/);
  const unit_number = unitLine && /^[A-Za-z0-9-]+$/.test(unitLine) ? unitLine : null;

  const numberBefore = (label: RegExp): number | null => {
    const l = lineBefore(lines, label);
    return l ? parseNumber(l.match(/\d[\d,]*(?:\.\d+)?/)?.[0]) : null;
  };

  const price =
    parseNumber(firstMatch(t, /(\d[\d,]*\.\d{2})\s+Unit Price in Numbers/)) ??
    parseNumber(firstMatch(t, /(\d[\d,]*\.\d{2})\s*\n\s*Unit Purchase Price/));

  return {
    type: "abu_dhabi_offplan_spa",
    project_name: projectRaw ? projectRaw.trim() : null,
    unit_number,
    area_sqm: numberBefore(/^Unit Total Area/),
    internal_area_sqm: numberBefore(/^Unit Internal Area/),
    balcony_area_sqm: numberBefore(/^Balcony/),
    price,
    plot_number: firstMatch(t, /\*\s*([A-Za-z0-9/-]+)\s+Plot No\.\s*\*/),
    project_number: firstMatch(t, /\*\s*(\d{8,})\s+Project No\.\s*\*/),
    estimated_completion_date: normalizeDate(
      firstMatch(t, /(\d{1,2}\/\d{1,2}\/\d{4})\s+Estimated Completion/),
    ),
  };
}

// ---------------------------------------------------------------------------
// Abu Dhabi — title deed (ADREC e-title deed)
// ---------------------------------------------------------------------------

/**
 * Abu Dhabi e-title deed — verified against a real ADREC export (Al Bandar,
 * unit 303). PROPERTY DETAILS rows extract as one line per row, English
 * label + value + mirrored Arabic label run together with no delimiter:
 *
 * ```
 * Unit No.303<Arabic label>
 * Unit Area.124.10 m²/1,335.80 ft²<Arabic label>
 * ```
 *
 * In OWNER DETAILS AND SHARES the owner's English name is a pure
 * Latin-uppercase line following the Arabic name (wrapped names span
 * consecutive lines). Deeds issued before ~2020 are scanned images with no
 * text layer — `pdf-parse` returns an empty string and every field is null.
 */
export function parseAbuDhabiTitleDeed(text: string): ParsedAbuDhabiTitleDeed {
  const t = normalizeText(text);

  const owner_names: string[] = [];
  const section = t.match(/OWNER DETAILS AND SHARES([\s\S]*?)(?:This Property and ownership|$)/)?.[1];
  if (section) {
    let current: string[] = [];
    const flush = () => {
      if (current.length > 0) pushUnique(owner_names, current.join(" "));
      current = [];
    };
    for (const line of toLines(section)) {
      if (/^[A-Z][A-Z .'-]{2,}$/.test(line)) current.push(line);
      else flush();
    }
    flush();
  }

  return {
    type: "abu_dhabi_title_deed",
    unit_number: firstMatch(t, /^Unit No\.?\s*([A-Za-z0-9-]+?)(?=[^\x00-\x7F\s]|\s|$)/m),
    area_sqm: parseNumber(firstMatch(t, /^Unit Area\.?\s*([\d,]+(?:\.\d+)?)\s*m/m)),
    owner_names,
    project_name: firstMatch(t, /^Project Name\s*([A-Za-z][A-Za-z0-9 '&.-]*?)(?=[^\x00-\x7F]|$)/m)?.trim() ?? null,
    plot_number: firstMatch(t, /^Plot No\.?\s*([A-Za-z0-9-]+?)(?=[^\x00-\x7F\s]|\s|$)/m),
    application_date: normalizeDate(firstMatch(t, /Application Date:\s*(\d{4}\/\d{2}\/\d{2})/)),
  };
}

// ---------------------------------------------------------------------------
// Dubai — title deed (DLD)
// ---------------------------------------------------------------------------

/**
 * Dubai title deed — verified against a real DLD export (Ellington House 1,
 * unit 713). The property table extracts as a block of VALUE lines followed
 * by the block of English labels in the same order, so a value is read from
 * the line above its label where that's adjacent:
 *
 * ```
 * 107.62
 * Suite Area :
 * 13.38
 * Balcony Area :
 * ```
 *
 * The owner rows read `(5167151) STEVE CHRISTOPHER HARO`, followed by the
 * owner's share area (the area figure). POSITIONAL (the one place we rely on
 * order): the value block is `[common area][area][parkings][floor][property
 * no]`, immediately followed by the `Common Area:` label, so
 * `property_number` is the line directly above `Common Area:` (digits only,
 * else `null`). The title deed number is the standalone `NNNNNN/YYYY` line
 * (repeated as each page footer).
 */
export function parseDubaiTitleDeed(text: string): ParsedDubaiTitleDeed {
  const t = normalizeText(text);
  const lines = toLines(t);

  const owner_names: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\(\d+\)\s+([A-Z][A-Z .'-]+)$/);
    if (m) pushUnique(owner_names, m[1]);
  }

  let area_sqm: number | null = null;
  const areaIdx = lines.findIndex((l) => l.startsWith("Area (Sq Meter)"));
  if (areaIdx >= 0) {
    const nums: number[] = [];
    for (const line of lines.slice(areaIdx + 1, areaIdx + 2 + owner_names.length * 2 + 2)) {
      if (/^Purchased from/.test(line)) break;
      if (/^[\d,]+(?:\.\d+)?$/.test(line)) nums.push(Number(line.replace(/,/g, "")));
    }
    if (nums.length > 1 && nums.length === owner_names.length) {
      area_sqm = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
    } else if (nums.length > 0) {
      area_sqm = nums[0];
    }
  }

  const numberBefore = (label: RegExp): number | null => {
    const l = lineBefore(lines, label);
    return l && /^[\d,]+(?:\.\d+)?$/.test(l) ? parseNumber(l) : null;
  };

  const propLine = lineBefore(lines, /^Common Area:/);
  const property_number = propLine && /^\d+$/.test(propLine) ? propLine : null;

  return {
    type: "dubai_title_deed",
    property_number,
    area_sqm,
    suite_area_sqm: numberBefore(/^Suite Area/),
    balcony_area_sqm: numberBefore(/^Balcony Area/),
    owner_names,
    building_name: extractDubaiDeedBuildingName(lines),
    title_deed_number: firstMatch(t, /^(\d{4,}\/\d{4})\s*$/m),
    purchase_price: parseNumber(firstMatch(t, /for the amount\s+(\d[\d,]*)/i)),
    issue_date: normalizeDate(firstMatch(t, /^(\d{2}\/\d{2}\/\d{4})\s*\n\s*Issue Date/m)),
  };
}

/** The building name value line starts with the Latin-uppercase name and continues straight into its mirrored Arabic (`ELLINGTON HOUSE<Arabic>`); no other line in the deed has that shape (owner rows start with `(`, other values are digits or mixed-case). */
function extractDubaiDeedBuildingName(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/^([A-Z][A-Z0-9 &'.-]{2,}?)\s*(?=[^\x00-\x7F])/);
    if (m) return titleCaseIfUpper(m[1].trim());
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dubai — Form F (Unified Sell Contract / MOU)
// ---------------------------------------------------------------------------

/** English name(s) under every `label` ("Seller Name" / "Buyer Name") line. After the label come an Arabic name line, then the English name run — either alone (`STEVE CHRISTOPHER HARO`), ahead of a mirrored Arabic label (`SHOLEEN TARIQ CARRIMJEEاسم البائع`) or ahead of `Signature Date` — and it can wrap onto a second line. Collection stops at the next structural line. Names repeat in the signature header and the detail section, so they're de-duplicated. */
function extractFormFNames(lines: string[], label: "Seller Name" | "Buyer Name"): string[] {
  const names: string[] = [];
  const stop = /^(?:Date\s*\d|Digital|Selling|Actual|Buying|Buyer\b|Seller\b|Owner|Contract|Person|Company|Unified)/;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== label) continue;
    const parts: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 7); j++) {
      const line = lines[j];
      if (stop.test(line)) break;
      const m = line.match(
        /^([A-Za-z][A-Za-z0-9 .,'&()-]*?)(?=\s*Signature Date|\s*[^\x00-\x7F]|\s*$)/,
      );
      if (!m) continue; // Arabic-only line
      parts.push(m[1].trim());
      if (/Signature Date/.test(line) || /[^\x00-\x7F]/.test(line)) break;
    }
    if (parts.length > 0) pushUnique(names, parts.join(" "));
  }
  return names;
}

/**
 * Dubai Form F (Unified Sell Contract (F) / MOU) — verified against two real
 * exports (Saba Tower 3 #2707: sell price AED 1,550,000.00; Jumeirah Park
 * A25). Label and value run together with the mirrored Arabic label:
 *
 * ```
 * Sell PriceAED 1,550,000.00 Deposit AmountAED 155,000.00
 * Contract NumberCF202405131694 StatusSigned
 * Title Deed #63560/2016
 * ```
 *
 * so amounts are read as `label + AED + amount`. Seller/buyer names come
 * from `extractFormFNames`. Handles the shifted-glyph export variant via
 * `normalizeText`. NOTE: this is the Form F / MOU only — a "Terms and
 * Conditions" cover sheet has no price block and yields nulls.
 */
export function parseDubaiFormF(text: string): ParsedDubaiFormF {
  const t = normalizeText(text);
  const lines = toLines(t);

  const amount = (label: string): number | null =>
    parseNumber(firstMatch(t, new RegExp(`${label}\\s*AED\\s*([\\d,]+(?:\\.\\d+)?)`)));

  return {
    type: "dubai_form_f",
    sell_price: amount("Sell Price"),
    deposit_amount: amount("Deposit Amount"),
    seller_names: extractFormFNames(lines, "Seller Name"),
    buyer_names: extractFormFNames(lines, "Buyer Name"),
    contract_number: firstMatch(t, /Contract Number\s*([A-Z]{2}\d+)/),
    title_deed_number: firstMatch(t, /Title Deed #\s*([\d/]+)/),
    start_date: normalizeDate(firstMatch(t, /Start Date\s*(\d{2}\/\d{2}\/\d{4})/)),
  };
}

// ---------------------------------------------------------------------------
// Dubai — Oqood (Initial Contract of Sale)
// ---------------------------------------------------------------------------

/**
 * Dubai Oqood "Initial Contract of Sale" — verified against a real export
 * (Eltiera Heights 807). The PROPERTY INFORMATION table extracts as the block
 * of labels followed by the block of values, so values are read by SHAPE
 * rather than by proximity to a label:
 *
 * ```
 * ELTIERA HEIGHTS/807        <- "PROJECT/UNIT"
 * 76.75 Sq.M.                <- net sold area
 * 2029828 AED                <- property value (first `N AED` line, before the voucher list)
 * Contract No.755314/2025
 * ```
 *
 * The voucher list further down carries unrelated `40617 AED` amounts (DLD
 * fees), so the value search stops at the voucher section.
 */
export function parseDubaiOqood(text: string): ParsedDubaiOqood {
  const t = normalizeText(text);
  const beforeVouchers = t.split(/V\s*O\s*U\s*C\s*H\s*E\s*R\s*S\s+L\s*I\s*S\s*T/)[0];
  const lines = toLines(beforeVouchers);

  let project_name: string | null = null;
  let unit_number: string | null = null;
  for (const line of lines) {
    const m = line.match(/^([A-Z][A-Z0-9 .'&-]*?)\s*\/\s*([A-Za-z0-9-]+)$/);
    if (m) {
      project_name = titleCaseIfUpper(m[1].trim());
      unit_number = m[2];
      break;
    }
  }

  let value: number | null = null;
  for (const line of lines) {
    if (/^\d[\d ,]*(?:\.\d{2})?\s*AED$/.test(line)) {
      value = parseNumber(line.replace(/\s+/g, ""));
      break;
    }
  }

  return {
    type: "dubai_oqood",
    project_name,
    unit_number,
    area_sqm: parseNumber(firstMatch(beforeVouchers, /^(\d+(?:\.\d+)?)\s*Sq\.?\s*M/m)),
    value,
    contract_number: firstMatch(t, /Contract No\.?\s*(\d+\/\d{4})/),
    contract_date: normalizeDate(firstMatch(t, /This contract is made on\s*(\d{2}\/\d{2}\/\d{4})/)),
  };
}

// ---------------------------------------------------------------------------
// Dubai — DLD fee receipt
// ---------------------------------------------------------------------------

/**
 * Dubai Land Department fee receipt — verified against three real receipts
 * (Eltiera Heights 807 pre-registration 40,617.00; Ellington House 713 sale
 * 68,020.00 and title-deed issuance 68,560.00). Fee rows are one line per
 * fee, English label + amount + mirrored Arabic label (`Knowledge fee10.00…`).
 * The procedure block lists three English labels, then their Arabic values,
 * then the English values — so the procedure type is the first ASCII-only
 * text line after the `Procedure Date` label and the date is the `D-M-YYYY`
 * line after it. `Name` (payer) can wrap (`NameELLINGTON PCFC DEVELOPERS ` /
 * `L.L.C`). The same registration fee is issued twice per sale (buyer's and
 * seller's receipt) — the parser can't tell whose receipt it is except via
 * `payer_name`. Only the first receipt in a multi-receipt PDF is parsed.
 */
export function parseDubaiDldReceipt(text: string): ParsedDubaiDldReceipt {
  const full = normalizeText(text);
  // One PDF can hold several receipts back to back (e.g. sale + title-deed
  // issuance); each ends with its "Print Date:" footer, so only the first is read.
  const printIdx = full.search(/Print Date:/);
  const t = printIdx >= 0 ? full.slice(0, printIdx + "Print Date:".length) : full;
  const lines = toLines(t);

  const fee = (label: string): number | null =>
    parseNumber(firstMatch(t, new RegExp(`^${label}\\s*([\\d,]+\\.\\d{2})`, "m")));

  const totalMatch = t.match(/Total Fees:[\s\S]{0,80}?(\d{1,3}(?:,\d{3})*\.\d{2})/);

  let procedure_type: string | null = null;
  let procedure_date: string | null = null;
  const procIdx = lines.findIndex((l) => l === "Procedure Date");
  if (procIdx >= 0) {
    for (const line of lines.slice(procIdx + 1, procIdx + 12)) {
      if (!procedure_type && /^[A-Za-z][A-Za-z \-/]+$/.test(line) && !/^Procedure\b/.test(line)) {
        procedure_type = line.replace(/\s+/g, " ");
      } else if (!procedure_date && /^\d{1,2}-\d{1,2}-\d{4}$/.test(line)) {
        procedure_date = normalizeDate(line);
        break;
      }
    }
  }

  let payer_name: string | null = null;
  const nameIdx = lines.findIndex((l) => /^Name\s*[A-Z]/.test(l));
  if (nameIdx >= 0) {
    const first = lines[nameIdx].match(/^Name\s*([A-Z][A-Z .'-]*?)(?=[^\x00-\x7F]|$)/)?.[1];
    if (first) {
      const next = lines[nameIdx + 1];
      const wrapped = !/[^\x00-\x7F]/.test(lines[nameIdx]) && next && /^[A-Z][A-Z. '-]*$/.test(next);
      payer_name = (wrapped ? `${first} ${next}` : first).replace(/\s+/g, " ").trim();
    }
  }

  const unitLine = lineBefore(lines, /^Unit Number$/);
  const buildingLine = lineBefore(lines, /^Building Name$/);

  return {
    type: "dubai_dld_receipt",
    payment_amount: totalMatch ? parseNumber(totalMatch[1]) : null,
    procedure_type,
    procedure_date,
    payer_name,
    unit_number: unitLine?.match(/(\d+)$/)?.[1] ?? null,
    building_name: buildingLine
      ? titleCaseIfUpper(buildingLine.match(/([A-Z][A-Za-z0-9 .'&-]*)$/)?.[1]?.trim() ?? "") || null
      : null,
    registration_fee: fee("Registration fees for the (?:purchase|sale)"),
    knowledge_fee: fee("Knowledge fee"),
    innovation_fee: fee("Innovation fee"),
    title_deed_fee: fee("Issuing title deed of real property"),
    map_fee: fee("Map Issue For Villa / Unit"),
  };
}

// ---------------------------------------------------------------------------
// Detection + dispatch
// ---------------------------------------------------------------------------

/** Best-effort document classification from the PDF text, or `null` if it isn't one of the supported types. Order matters: Oqood and receipts are checked before the looser title-deed signature. */
export function detectPropertyDocumentType(text: string): PropertyDocumentType | null {
  const t = normalizeText(text);
  if (/Off-Plan Unit Sale and Purchase Agreement/i.test(t) || /Particulars Of Sale And Purchase/i.test(t)) {
    return "abu_dhabi_offplan_spa";
  }
  if (/INITIAL CONTRACT OF SALE/i.test(t)) return "dubai_oqood";
  if (/Unified Sell Contract\s*\(F\)/i.test(t)) return "dubai_form_f";
  if (/dubailand\.gov\.ae/i.test(t) && /Fees Details|Procedure (?:Type|Data)/.test(t)) {
    return "dubai_dld_receipt";
  }
  if (/Abu Dhabi Real\s+Estate Centre/i.test(t) && /Title Deed/i.test(t)) return "abu_dhabi_title_deed";
  if (/Title Deed/.test(t) && /Issue Date/.test(t) && /Owners numbers/i.test(t)) return "dubai_title_deed";
  return null;
}

/** Parses `text` as `type`, or as the auto-detected type when omitted. Returns `null` only when no type was given and none could be detected. */
export function parsePropertyDocument(
  text: string,
  type?: PropertyDocumentType,
): ParsedPropertyDocument | null {
  const resolved = type ?? detectPropertyDocumentType(text);
  switch (resolved) {
    case "abu_dhabi_offplan_spa":
      return parseAbuDhabiOffplanSpa(text);
    case "abu_dhabi_title_deed":
      return parseAbuDhabiTitleDeed(text);
    case "dubai_title_deed":
      return parseDubaiTitleDeed(text);
    case "dubai_form_f":
      return parseDubaiFormF(text);
    case "dubai_oqood":
      return parseDubaiOqood(text);
    case "dubai_dld_receipt":
      return parseDubaiDldReceipt(text);
    default:
      return null;
  }
}

/** True if at least one field (other than the `type` discriminator) was successfully extracted — used to decide whether to surface a "couldn't read this document" error instead of silently saving nothing. */
export function hasAnyExtractedField(parsed: ParsedPropertyDocument): boolean {
  return Object.entries(parsed).some(([key, v]) => {
    if (key === "type") return false;
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== "";
  });
}

// ---------------------------------------------------------------------------
// Mapping onto RealEstateMetadata
// ---------------------------------------------------------------------------

function ownershipFromNames(names: string[]): RealEstateMetadata["ownership"] | undefined {
  if (names.length === 0) return undefined;
  const share = Math.round((10000 / names.length)) / 100;
  return names.map((name) => ({ name, percentage: share }));
}

function emirateOf(type: PropertyDocumentType): Emirate {
  return type.startsWith("abu_dhabi") ? "abu_dhabi" : "dubai";
}

/** Drops keys whose value is `undefined`/`null` so the patch only carries what was actually extracted. */
function compact<T extends object>(o: T): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null),
  ) as { [K in keyof T]?: NonNullable<T[K]> };
}

/**
 * Maps a parsed document onto the EXISTING `RealEstateMetadata` schema (no
 * new fields). Only extracted values are included, so the result is safe to
 * spread over current metadata. Mapping:
 *
 * - abu_dhabi_offplan_spa  -> `emirate`="abu_dhabi", `is_offplan`=true,
 *   `contract_price` + `purchasePrice` (price), `surfaceArea` (total area),
 *   `internal_area`, `terrace_area` (balcony), `adrec_plot_number`,
 *   `adrec_project_id` (ADREC project no.), `address` ("<project> - Unit <n>").
 *   NO field: estimated completion date (no schedule/handover field),
 *   unit number on its own (only embedded in `address`).
 * - abu_dhabi_title_deed   -> `emirate`="abu_dhabi", `surfaceArea`,
 *   `adrec_plot_number`, `ownership` (owners, equal split — the deed shows
 *   each owner's share but it isn't extracted), `address` ("<project> - Unit
 *   <n>"). NO field: unit number alone, application date.
 * - dubai_title_deed       -> `emirate`="dubai", `surfaceArea`, `internal_area`
 *   (suite), `terrace_area` (balcony), `purchasePrice`, `title_deed_number`,
 *   `ownership`, `address` ("<building> - Unit <n>"). NO field: property
 *   number alone, issue date.
 * - dubai_form_f           -> `emirate`="dubai", `purchasePrice` (sell price —
 *   the caller must decide if the user was the buyer), `title_deed_number`.
 *   NO field: seller/buyer names (would be wrong to put in `ownership` for
 *   a seller), deposit amount, contract number, start date.
 * - dubai_oqood            -> `emirate`="dubai", `is_offplan`=true,
 *   `contract_price` + `purchasePrice` (value), `oqood_number` (contract
 *   no.), `surfaceArea` (net sold area), `address` ("<project> - Unit <n>").
 *   NO field: contract date.
 * - dubai_dld_receipt      -> `emirate`="dubai", `registration_fee_type`=
 *   "RERA" + `registration_fee_amount` (registration fee; falls back to the
 *   receipt total when the registration line is missing),
 *   `rera_knowledge_fee`, `rera_title_deed_processing_fees` (title-deed
 *   issuance fee). NO field: innovation fee, map issue fee, procedure
 *   type/date, payer name, unit/building (receipt is not an address source).
 *
 * Never mapped anywhere: owner/seller/buyer Emirates IDs, payment vouchers.
 */
export function toRealEstateMetadataPatch(parsed: ParsedPropertyDocument): Partial<RealEstateMetadata> {
  const emirate = emirateOf(parsed.type);
  const addr = (place: string | null, unit: string | null): string | null =>
    place && unit ? `${place} - Unit ${unit}` : null;

  switch (parsed.type) {
    case "abu_dhabi_offplan_spa":
      return compact({
        emirate,
        is_offplan: true,
        contract_price: parsed.price,
        purchasePrice: parsed.price,
        surfaceArea: parsed.area_sqm,
        internal_area: parsed.internal_area_sqm,
        terrace_area: parsed.balcony_area_sqm,
        adrec_plot_number: parsed.plot_number,
        adrec_project_id: parsed.project_number,
        address: addr(parsed.project_name, parsed.unit_number),
      });
    case "abu_dhabi_title_deed":
      return compact({
        emirate,
        surfaceArea: parsed.area_sqm,
        adrec_plot_number: parsed.plot_number,
        ownership: ownershipFromNames(parsed.owner_names),
        address: addr(parsed.project_name, parsed.unit_number),
      });
    case "dubai_title_deed":
      return compact({
        emirate,
        surfaceArea: parsed.area_sqm,
        internal_area: parsed.suite_area_sqm,
        terrace_area: parsed.balcony_area_sqm,
        purchasePrice: parsed.purchase_price,
        title_deed_number: parsed.title_deed_number,
        ownership: ownershipFromNames(parsed.owner_names),
        address: addr(parsed.building_name, parsed.property_number),
      });
    case "dubai_form_f":
      return compact({
        emirate,
        purchasePrice: parsed.sell_price,
        title_deed_number: parsed.title_deed_number,
      });
    case "dubai_oqood":
      return compact({
        emirate,
        is_offplan: true,
        contract_price: parsed.value,
        purchasePrice: parsed.value,
        oqood_number: parsed.contract_number,
        surfaceArea: parsed.area_sqm,
        address: addr(parsed.project_name, parsed.unit_number),
      });
    case "dubai_dld_receipt": {
      const registration = parsed.registration_fee ?? parsed.payment_amount;
      return compact({
        emirate,
        registration_fee_type: registration !== null ? ("RERA" as const) : undefined,
        registration_fee_amount: registration,
        rera_knowledge_fee: parsed.knowledge_fee,
        rera_title_deed_processing_fees: parsed.title_deed_fee,
      });
    }
  }
}
