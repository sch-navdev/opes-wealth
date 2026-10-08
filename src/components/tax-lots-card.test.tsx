import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaxLotsCard, TAX_LOT_METHOD_STORAGE_KEY } from "@/components/tax-lots-card";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { EquityTrade } from "@/lib/equities";

// Invented fixtures only.
function trade(id: string, side: "buy" | "sell", tradeDate: string, quantity: number, price: number, extra: Partial<EquityTrade> = {}): EquityTrade {
  return { id, side, tradeDate, quantity, price, currency: "USD", source: "manual", ...extra };
}

/** Lots at 100 / 150 / 120, one sale of 15 @ 160; 15 shares left, priced at 200 (value 3000). */
const TEXTBOOK: EquityTrade[] = [
  trade("b1", "buy", "2023-01-10", 10, 100),
  trade("b2", "buy", "2023-03-15", 10, 150),
  trade("b3", "buy", "2023-06-01", 10, 120),
  trade("s1", "sell", "2024-02-01", 15, 160),
];

function asset(trades: EquityTrade[], over: { quantity?: number; current_value?: number; currency?: string } = {}) {
  return {
    quantity: over.quantity ?? 15,
    current_value: over.current_value ?? 3000,
    currency: over.currency ?? "USD",
    metadata: { exchange: "NASDAQ", trades } as Record<string, unknown>,
  };
}

function renderCard(props: Partial<Parameters<typeof TaxLotsCard>[0]> = {}) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <TaxLotsCard asset={asset(TEXTBOOK)} asOf="2024-03-20" {...props} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

const summary = () => ({
  remaining: screen.getByTestId("lots-remaining-cost").textContent,
  unrealised: screen.getByTestId("lots-unrealised").textContent,
  realised: screen.getByTestId("lots-realised-total").textContent,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("TaxLotsCard", () => {
  it("defaults to FIFO with a labelled radio group, the summary, scope note and disclaimer", () => {
    renderCard();
    expect(screen.getByRole("region", { name: "Tax lots" })).toBeTruthy();
    const group = screen.getByRole("radiogroup", { name: "Matching method" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["FIFO", "LIFO", "HIFO", "Average cost"]);
    expect(within(group).getByRole("radio", { name: "FIFO" })).toHaveAttribute("aria-checked", "true");
    expect(group).toHaveAccessibleDescription(/First in, first out/);
    expect(summary()).toEqual({ remaining: "$1,950.00", unrealised: "+$1,050.00", realised: "+$650.00" });
    expect(screen.getByTestId("lots-unrealised").className).toContain("text-success");
    expect(screen.getByText(/crypto holdings have no trade ledger/)).toBeTruthy();
    expect(
      screen.getByText("Illustrative lot matching for your records; tax treatment depends on your residency; not tax advice."),
    ).toBeTruthy();
    expect(screen.queryByTestId("owner-share-note")).toBeNull();
    expect(screen.queryByTestId("lots-warnings")).toBeNull();
  });

  it("switching method recomputes the figures and remembers the choice", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("radio", { name: "LIFO" }));
    expect(screen.getByRole("radio", { name: "LIFO" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "FIFO" })).toHaveAttribute("aria-checked", "false");
    expect(summary()).toEqual({ remaining: "$1,750.00", unrealised: "+$1,250.00", realised: "+$450.00" });
    expect(screen.getByText(/Last in, first out/)).toBeTruthy();
    expect(localStorage.getItem(TAX_LOT_METHOD_STORAGE_KEY)).toBe("lifo");

    await user.click(screen.getByRole("radio", { name: "HIFO" }));
    expect(summary()).toEqual({ remaining: "$1,600.00", unrealised: "+$1,400.00", realised: "+$300.00" });

    await user.click(screen.getByRole("radio", { name: "Average cost" }));
    expect(summary()).toEqual({ remaining: "$1,850.00", unrealised: "+$1,150.00", realised: "+$550.00" });
    expect(localStorage.getItem(TAX_LOT_METHOD_STORAGE_KEY)).toBe("average");
  });

  it("starts from the stored method, and ignores an unknown stored value", () => {
    localStorage.setItem(TAX_LOT_METHOD_STORAGE_KEY, "hifo");
    const { unmount } = renderCard();
    expect(screen.getByRole("radio", { name: "HIFO" })).toHaveAttribute("aria-checked", "true");
    expect(summary().realised).toBe("+$300.00");
    unmount();

    localStorage.setItem(TAX_LOT_METHOD_STORAGE_KEY, "specific-id");
    renderCard();
    expect(screen.getByRole("radio", { name: "FIFO" })).toHaveAttribute("aria-checked", "true");
  });

  it("supports the radio-group keyboard pattern (arrows wrap, Home/End) with a roving tabindex", async () => {
    const user = userEvent.setup();
    renderCard();
    const fifo = screen.getByRole("radio", { name: "FIFO" });
    expect(fifo).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "LIFO" })).toHaveAttribute("tabindex", "-1");

    await user.tab();
    expect(fifo).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "LIFO" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "LIFO" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Average cost" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "FIFO" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Average cost" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "FIFO" })).toHaveFocus();
  });

  it("still works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    renderCard();
    expect(screen.getByRole("radio", { name: "FIFO" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "LIFO" }));
    expect(screen.getByRole("radio", { name: "LIFO" })).toHaveAttribute("aria-checked", "true");
    expect(summary().realised).toBe("+$450.00");
  });

  it("lists open lots with per-share unit costs, held days and a neutral 12-month marker", () => {
    renderCard();
    const table = screen.getByRole("table", { name: "Shares still held, by purchase lot, in USD." });
    for (const th of within(table).getAllByRole("columnheader")) expect(th).toHaveAttribute("scope", "col");
    const rows = within(table).getAllByTestId("lots-open-row");
    expect(rows).toHaveLength(2);
    // b2: 5 left @ 150, held 2023-03-15 -> 2024-03-20 = 371 days (12+ months)
    expect(within(rows[0]).getByRole("rowheader").textContent).toBe("Mar 15, 2023");
    expect(within(rows[0]).getByText("$150.00")).toBeTruthy();
    expect(within(rows[0]).getByText("$750.00")).toBeTruthy();
    expect(within(rows[0]).getByText("+$250.00")).toBeTruthy();
    expect(within(rows[0]).getByText("Held 12+ months")).toBeTruthy();
    expect(within(rows[0]).getByText("371")).toBeTruthy();
    // b3: 10 left @ 120, 293 days, no marker
    expect(within(rows[1]).queryByText("Held 12+ months")).toBeNull();
    expect(within(rows[1]).getByText("293")).toBeTruthy();
  });

  it("shows realised gain by year and the realised matches", () => {
    renderCard();
    const years = screen.getByRole("table", { name: "Grouped by the calendar year of each sale, in USD." });
    expect(within(years).getByRole("rowheader", { name: "2024" })).toBeTruthy();
    expect(within(years).getByText("$2,400.00")).toBeTruthy();
    expect(within(years).getByText("$1,750.00")).toBeTruthy();
    const matches = screen.getByRole("table", { name: "Each sale matched to the purchase lots it used, in USD." });
    const rows = within(matches).getAllByTestId("lots-match-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Jan 10, 2023")).toBeTruthy();
    expect(within(rows[0]).getByText("+$600.00")).toBeTruthy();
    expect(within(rows[0]).getByText("387")).toBeTruthy();
  });

  it("collapses a long list of matches behind an accessible toggle", async () => {
    const user = userEvent.setup();
    const trades = [
      trade("b", "buy", "2024-01-02", 100, 10),
      ...Array.from({ length: 7 }, (_, i) => trade(`s${i}`, "sell", `2024-02-0${i + 1}`, 1, 12)),
    ];
    renderCard({ asset: asset(trades, { quantity: 93, current_value: 930 }) });
    expect(screen.getAllByTestId("lots-match-row")).toHaveLength(5);
    const toggle = screen.getByRole("button", { name: "Show all 7 matches" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(toggle.getAttribute("aria-controls") as string)?.tagName).toBe("TABLE");
    await user.click(toggle);
    expect(screen.getAllByTestId("lots-match-row")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
  });

  it("scales amounts and quantities to the viewer's share, never the unit cost", () => {
    renderCard({ ownerFactor: 0.5 });
    expect(screen.getByTestId("owner-share-note")).toBeTruthy();
    expect(summary()).toEqual({ remaining: "$975.00", unrealised: "+$525.00", realised: "+$325.00" });
    const table = screen.getByRole("table", { name: "Shares still held, by purchase lot, in USD." });
    const [first] = within(table).getAllByTestId("lots-open-row");
    expect(within(first).getByText("2.5")).toBeTruthy(); // 5 shares x 50%
    expect(within(first).getByText("$150.00")).toBeTruthy(); // unit cost unchanged
    expect(within(first).getByText("$375.00")).toBeTruthy(); // 750 x 50%
  });

  it("masks amounts and quantities and drops the gain colours in privacy mode", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderCard();
    expect(summary()).toEqual({ remaining: "••••••••", unrealised: "••••••••", realised: "••••••••" });
    expect(screen.getByTestId("lots-unrealised").className).not.toContain("text-success");
    expect(screen.queryByText("$150.00")).toBeNull();
  });

  it("lists data warnings: oversold sale, other-currency trade, invalid trade, quantity mismatch", () => {
    const trades = [
      trade("b", "buy", "2024-01-02", 10, 10),
      trade("eur", "buy", "2024-01-03", 5, 10, { currency: "EUR" }),
      trade("zero", "buy", "2024-01-04", 0, 10),
      trade("s", "sell", "2024-02-01", 12, 12),
    ];
    renderCard({ asset: asset(trades, { quantity: 3, current_value: 36 }) });
    const warnings = within(screen.getByTestId("lots-warnings")).getAllByRole("listitem").map((li) => li.textContent);
    expect(warnings).toEqual([
      "Trade on Jan 3, 2024 is in EUR, not the holding's currency; it is left out.",
      "Trade on Jan 4, 2024 has a missing or invalid quantity, price, type or date; it is left out.",
      "Sale on Feb 1, 2024 is larger than the shares held by 2; that part is not matched.",
      "Open lots add up to 0 shares while the holding records 3.",
    ]);
    expect(screen.getByText("No open lots: the position is fully sold.")).toBeTruthy();
  });

  it("without a current price, unrealised figures are a dash with a short note", () => {
    renderCard({ asset: asset([trade("b", "buy", "2024-01-02", 10, 10)], { quantity: 0, current_value: 0 }) });
    expect(screen.getByTestId("lots-unrealised").textContent).toBe("—");
    expect(screen.getByText("No current price available.")).toBeTruthy();
    // buy-only ledger: both sales sections say so
    expect(screen.getAllByText("No sales recorded yet.")).toHaveLength(2);
    expect(summary().realised).toBe("$0.00");
  });
});
