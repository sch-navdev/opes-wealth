/**
 * Client Knowledge Document (DCC) PDF, generated entirely in the browser with
 * jsPDF (the data never leaves the device). Bilingual: every label comes from
 * `translate(locale, "dcc_…")` in `lib/i18n.ts`, with `locale` chosen in the
 * dialog independently of the UI language. No logos or images.
 *
 * Optional protection: with a password the PDF is encrypted with it as the
 * USER (viewing) password; a random owner password is set and only printing
 * is permitted. This is the PDF standard's RC4 encryption as implemented by
 * jsPDF — enough to stop casual opening, not strong modern encryption, so
 * send the password through a different channel and treat the file as
 * sensitive.
 */
import {
  DCC_OBJECTIVES,
  DCC_PERSON_TEXT_FIELDS,
  DCC_PERSON_YESNO_FIELDS,
  DCC_TAX_INCOME_FIELDS,
  DCC_TAX_WEALTH_FIELDS,
  type DccAmountRow,
  type DccData,
  type DccLoanRow,
  type DccPerson,
  type DccWealthRow,
} from "@/lib/dcc";
import { translate, type TranslationKey } from "@/lib/i18n";
import { localeInfo, type Locale } from "@/lib/locales";
import { drawLogo, drawPdfChrome, loadPdfLogo, type PdfLogo } from "@/lib/pdf-branding";

const INK: [number, number, number] = [31, 41, 55];
const ACCENT: [number, number, number] = [168, 124, 31];
const MUTED: [number, number, number] = [107, 114, 128];
const BAND: [number, number, number] = [243, 244, 246];
const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
/** First content line on a page after the cover (clears the header logo band). */
const TOP = 18;

const BRACKETS = [50000, 75000, 100000, 200000, 500000];

export async function generateDccPdf(
  data: DccData,
  locale: Locale,
  password: string,
  /** Override for tests; by default the logo is loaded from `/logo.png`. `null` = no logo. */
  logoOverride?: PdfLogo | null,
): Promise<Blob> {
  const logo = logoOverride === undefined ? await loadPdfLogo() : logoOverride;
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const numberFormat = new Intl.NumberFormat(localeInfo(locale).intl, {
    maximumFractionDigits: 0,
  });
  // jsPDF's built-in fonts can't draw the narrow no-break space Intl uses as a thousands separator.
  const money = (n: number | null | undefined) =>
    n == null ? "" : `${numberFormat.format(n).replace(/[  ]/g, " ")} ${data.portfolio.currency}`;
  const cur = data.portfolio.currency;

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    ...(password
      ? {
          encryption: {
            userPassword: password,
            ownerPassword: crypto.randomUUID(),
            userPermissions: ["print" as const],
          },
        }
      : {}),
  });

  const today = new Date().toISOString().slice(0, 10);
  const clientName = [data.you.fullName, data.includeSpouse ? data.spouse.fullName : ""]
    .filter(Boolean)
    .join(" & ");

  let y = MARGIN;
  const finalY = () =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  function ensure(space: number) {
    if (y + space > PAGE_H - 20) {
      doc.addPage();
      y = TOP;
    }
  }

  function heading(text: string) {
    ensure(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(text, MARGIN, y + 4);
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y + 6.5, PAGE_W - MARGIN, y + 6.5);
    y += 12;
  }

  function subheading(text: string) {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ACCENT);
    doc.text(text, MARGIN, y + 3);
    y += 6;
  }

  function note(text: string) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(text, PAGE_W - 2 * MARGIN) as string[];
    ensure(lines.length * 4 + 2);
    doc.text(lines, MARGIN, y + 3);
    y += lines.length * 4 + 2;
  }

  function table(head: string[], body: (string | number)[][], opts?: { foot?: string[]; right?: number[] }) {
    ensure(20);
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length > 0 ? body : [head.map((_, i) => (i === 0 ? t("dcc_none_recorded") : ""))],
      foot: opts?.foot ? [opts.foot] : undefined,
      margin: { left: MARGIN, right: MARGIN, top: 18, bottom: 20 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: 1.8, lineColor: [209, 213, 219], lineWidth: 0.1 },
      headStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold" },
      footStyles: { fillColor: BAND, textColor: INK, fontStyle: "bold" },
      columnStyles: Object.fromEntries((opts?.right ?? []).map((i) => [i, { halign: "right" }])),
    });
    y = finalY() + 6;
  }

  const yesNo = (v: string) => (v === "yes" ? t("dcc_yes") : v === "no" ? t("dcc_no") : "");
  const people: { label: string; person: DccPerson }[] = [
    { label: t("dcc_you"), person: data.you },
    ...(data.includeSpouse ? [{ label: t("dcc_spouse"), person: data.spouse }] : []),
  ];

  function personTable(group: (typeof DCC_PERSON_TEXT_FIELDS)[number]["group"]) {
    const rows = DCC_PERSON_TEXT_FIELDS.filter((f) => f.group === group).map((f) => [
      t(f.label),
      ...people.map((p) => String(p.person[f.key] ?? "")),
    ]);
    table(["", ...people.map((p) => p.label)], rows);
  }

  const bracketLine = (total: number) => {
    const edges = [0, ...BRACKETS];
    const labels = edges.map((from, i) =>
      i === edges.length - 1
        ? `> ${numberFormat.format(from).replace(/[  ]/g, " ")}`
        : `${numberFormat.format(from).replace(/[  ]/g, " ")} – ${numberFormat.format(edges[i + 1]).replace(/[  ]/g, " ")}`,
    );
    const index = edges.reduce((acc, from, i) => (total >= from ? i : acc), 0);
    return labels.map((l, i) => `${i === index ? "[x]" : "[ ]"} ${l} ${cur}`).join("    ");
  };

  // ---- Cover ---------------------------------------------------------------
  doc.setFillColor(...BAND);
  doc.rect(0, 0, PAGE_W, 110, "F");
  if (logo) drawLogo(doc, logo, MARGIN, 16, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...ACCENT);
  doc.text("Opes Wealth", MARGIN + (logo ? (24 * logo.width) / logo.height + 4 : 0), 31);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(t("dcc_title"), PAGE_W - 2 * MARGIN) as string[], MARGIN, 55);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1);
  doc.line(MARGIN, 72, MARGIN + 40, 72);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(t("dcc_prepared_for"), MARGIN, 130);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(
    doc.splitTextToSize([data.clientTitle, clientName].filter(Boolean).join(" "), PAGE_W - 2 * MARGIN) as string[],
    MARGIN,
    139,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(t("dcc_your_advisor"), MARGIN, 165);
  doc.setTextColor(...INK);
  const advisorLines = [
    data.advisorName,
    data.advisorFirm,
    data.advisorPhone ? `Tel: ${data.advisorPhone}` : "",
    data.advisorEmail ? `Email: ${data.advisorEmail}` : "",
  ].filter(Boolean);
  doc.text(advisorLines.length > 0 ? advisorLines : ["—"], MARGIN, 173);
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${t("dcc_generated_on")} ${today}`, MARGIN, 255);
  doc.text(t("dcc_confidential"), MARGIN, 261);
  doc.addPage();
  y = TOP;

  // ---- You and your spouse ------------------------------------------------------
  heading(t("dcc_section_you_spouse"));
  subheading(t("dcc_section_civil"));
  personTable("civil");
  subheading(t("dcc_section_contact"));
  personTable("contact");
  subheading(t("dcc_section_family"));
  personTable("family");
  table(
    ["", ...people.map((p) => p.label)],
    [[t("dcc_pep"), ...people.map((p) => yesNo(p.person.pep))]],
  );

  heading(t("dcc_section_professional"));
  personTable("work");
  table(
    ["", ...people.map((p) => p.label)],
    DCC_PERSON_YESNO_FIELDS.filter((f) => f.key !== "pep").map((f) => [
      t(f.label),
      ...people.map((p) => yesNo(String(p.person[f.key] ?? ""))),
    ]),
  );
  personTable("investor");

  subheading(t("dcc_section_relations"));
  table(
    [t("dcc_col_name"), t("dcc_col_relation"), t("dcc_col_birth"), t("dcc_col_phone"), t("dcc_col_email")],
    data.relations.map((r) => [r.name, r.relation, r.birthDate, r.phone, r.email]),
  );

  // ---- Wealth ------------------------------------------------------------------------
  const p = data.portfolio;
  const sum = (rows: DccWealthRow[]) => rows.reduce((s, r) => s + r.value, 0);
  heading(t("dcc_section_wealth"));
  note(t("dcc_basis", { currency: cur, date: today }));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  ensure(16);
  doc.text(`${t("dcc_wealth_evaluation")}: ${money(p.netWorth)}`, MARGIN, y + 3);
  y += 6;
  const bracket = doc.splitTextToSize(bracketLine(p.netWorth), PAGE_W - 2 * MARGIN) as string[];
  doc.setFontSize(7.5);
  doc.text(bracket, MARGIN, y + 3);
  y += bracket.length * 3.6 + 4;

  const wealthHead = [t("dcc_col_designation"), t("dcc_col_institution"), t("dcc_col_value"), t("dcc_col_date")];
  const wealthBody = (rows: DccWealthRow[]) =>
    rows.map((r) => [r.designation, r.institution, money(r.value), r.date]);

  subheading(t("dcc_section_financial"));
  table(wealthHead, wealthBody(p.financial), { foot: [t("dcc_total"), "", money(sum(p.financial)), ""], right: [2] });

  subheading(t("dcc_section_real_estate"));
  table(
    [t("dcc_col_designation"), t("dcc_col_date"), t("dcc_col_purchase_value"), t("dcc_col_market_value"), t("dcc_col_holding_mode")],
    p.realEstate.map((r) => [
      r.designation + (r.institution ? ` (${r.institution})` : ""),
      r.date,
      money(r.purchaseValue),
      money(r.value),
      r.holdingMode ? t(r.holdingMode as TranslationKey) : "",
    ]),
    { foot: [t("dcc_total"), "", "", money(sum(p.realEstate)), ""], right: [2, 3] },
  );

  const loanHead = [
    t("dcc_col_object"),
    t("dcc_col_loan_amount"),
    t("dcc_col_duration"),
    t("dcc_col_rate"),
    t("dcc_col_annuity"),
    t("dcc_col_remaining"),
  ];
  const loanBody = (rows: DccLoanRow[]) =>
    rows.map((l) => [
      l.object,
      money(l.amount),
      l.durationMonths != null ? `${l.durationMonths} ${t("dcc_months")}` : "",
      l.rate != null ? `${l.rate} %` : "",
      money(l.annuity),
      money(l.remaining),
    ]);
  const loanFoot = (rows: DccLoanRow[]) => [
    t("dcc_total"),
    "",
    "",
    "",
    money(rows.reduce((s, l) => s + (l.annuity ?? 0), 0)),
    money(rows.reduce((s, l) => s + l.remaining, 0)),
  ];
  subheading(t("dcc_section_property_loans"));
  table(loanHead, loanBody(p.realEstateLoans), { foot: loanFoot(p.realEstateLoans), right: [1, 4, 5] });

  subheading(t("dcc_section_other"));
  table(wealthHead, wealthBody(p.other), { foot: [t("dcc_total"), "", money(sum(p.other)), ""], right: [2] });
  subheading(t("dcc_section_other_loans"));
  table(loanHead, loanBody(p.otherLoans), { foot: loanFoot(p.otherLoans), right: [1, 4, 5] });

  // ---- Income & charges ---------------------------------------------------------------
  const incomeRows: DccAmountRow[] = [...p.derivedIncome, ...data.extraIncome];
  const chargeRows: DccAmountRow[] = [...p.derivedCharges, ...data.extraCharges];
  const natureText = (n: string) => (n.startsWith("dcc_") ? t(n as TranslationKey) : n);
  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalCharges = chargeRows.reduce((s, r) => s + r.amount, 0);
  heading(t("dcc_section_income"));
  ensure(12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(`${t("dcc_income_evaluation")}: ${money(totalIncome)}`, MARGIN, y + 3);
  y += 6;
  const incomeBracket = doc.splitTextToSize(bracketLine(totalIncome), PAGE_W - 2 * MARGIN) as string[];
  doc.setFontSize(7.5);
  doc.text(incomeBracket, MARGIN, y + 3);
  y += incomeBracket.length * 3.6 + 4;
  const amountHead = [t("dcc_col_label"), t("dcc_col_nature"), t("dcc_col_annual_amount"), t("dcc_col_holder")];
  const amountBody = (rows: DccAmountRow[]) =>
    rows.map((r) => [r.label, natureText(r.nature), money(r.amount), r.holder]);
  table(amountHead, amountBody(incomeRows), { foot: [t("dcc_total"), "", money(totalIncome), ""], right: [2] });
  subheading(t("dcc_section_charges"));
  table(amountHead, amountBody(chargeRows), { foot: [t("dcc_total"), "", money(totalCharges), ""], right: [2] });

  // ---- Taxation -----------------------------------------------------------------------------
  heading(t("dcc_section_tax"));
  subheading(`${t("dcc_section_income_tax")} — ${data.taxYear}`);
  table(
    [t("dcc_col_label"), t("dcc_you")],
    DCC_TAX_INCOME_FIELDS.map((k) => [t(k), data.taxIncome[k] ?? ""]),
  );
  subheading(`${t("dcc_section_wealth_tax")} — ${data.taxYear}`);
  table(
    [t("dcc_col_label"), t("dcc_you")],
    DCC_TAX_WEALTH_FIELDS.map((k) => [t(k), data.taxWealth[k] ?? ""]),
  );

  // ---- Objectives -------------------------------------------------------------------------------
  heading(t("dcc_section_objectives"));
  const chosen = DCC_OBJECTIVES.filter((o) => data.objectives[o.key]?.priority)
    .map((o) => ({ o, d: data.objectives[o.key]! }))
    .sort((a, b) => Number(a.d.priority) - Number(b.d.priority));
  table(
    [t("dcc_col_priority"), t("dcc_col_objective"), t("dcc_col_horizon")],
    chosen.map(({ o, d }) => [d.priority, t(o.label), d.horizon ? `${d.horizon} ${t("dcc_years")}` : ""]),
  );
  heading(t("dcc_section_additional"));
  const annuities = chargeRows
    .filter((r) => r.nature === "dcc_nature_loan_payments" || r.nature === "dcc_nature_property_loans")
    .reduce((s, r) => s + r.amount, 0);
  table(
    [t("dcc_col_label"), t("dcc_amount")],
    [
      [t("dcc_precaution_amount"), data.precautionAmount ? `${data.precautionAmount} ${cur}` : ""],
      [t("dcc_debt_ratio"), totalIncome > 0 ? `${((annuities / totalIncome) * 100).toFixed(2)} %` : ""],
    ],
  );

  // ---- Warning & signatures --------------------------------------------------------------------------
  heading(t("dcc_section_warning"));
  note(t("dcc_warning_text"));
  ensure(60);
  const boxW = (PAGE_W - 2 * MARGIN - 10) / 2;
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  [t("dcc_signature_advisor"), t("dcc_signature_client")].forEach((label, i) => {
    const x = MARGIN + i * (boxW + 10);
    doc.rect(x, y, boxW, 45);
    doc.text(label, x + 2, y + 5);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(t("dcc_read_approved"), x + 2, y + 10);
    doc.setFont("helvetica", "normal");
    doc.text(`${t("dcc_made_at")} ................................ ${t("dcc_on")} ....................`, x + 2, y + 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
  });
  y += 52;

  ensure(30);
  doc.setFillColor(...BAND);
  doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(t("dcc_section_advisor_box"), MARGIN + 3, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`[ ] ${t("dcc_advisor_check_consistency")} ....................`, MARGIN + 3, y + 13);
  doc.text(`[ ] ${t("dcc_advisor_check_completeness")} ....................`, MARGIN + 3, y + 20);

  // ---- Header (logo) and footer (page numbers) on every page after the cover ---------------------------------
  drawPdfChrome(doc, {
    logo,
    firstPage: 2,
    margin: MARGIN,
    pageWidth: PAGE_W,
    pageHeight: PAGE_H,
    leftCaption: `${t("dcc_title")} — ${clientName}`.trim(),
    pageLabel: (n, total) => t("pdf_page_of", { n, total }),
  });

  return doc.output("blob");
}
