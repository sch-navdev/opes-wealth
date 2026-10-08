import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IrrCompare, STORAGE_KEY } from "@/components/irr-compare";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { ComparableHolding } from "@/lib/irr-compare-types";

const HOLDINGS: ComparableHolding[] = [
  {
    id: "villa",
    name: "Dubai Villa",
    category: "Real Estate",
    currency: "AED",
    flows: [
      { date: "2020-01-01", amount: -500000 },
      { date: "2022-01-01", amount: 20000 },
      { date: "2025-01-01", amount: 650000 },
    ],
    includes: { purchase: true, income: true, currentValue: true, financing: false },
  },
  {
    id: "apple",
    name: "Apple Inc",
    category: "Equities",
    currency: "AED",
    flows: [
      { date: "2021-01-01", amount: -10000 },
      { date: "2026-01-01", amount: 15000 },
    ],
    includes: { purchase: true, income: false, currentValue: true, financing: true },
  },
  {
    id: "sold",
    name: "Sold Stock",
    category: "Equities",
    currency: "AED",
    flows: [
      { date: "2021-01-01", amount: -10000 },
      { date: "2023-01-01", amount: 12000 },
    ],
    includes: { purchase: true, income: true, currentValue: false, financing: true },
  },
  { id: "car", name: "Old Car", category: "Vehicles", currency: "AED", unavailable: "missing_purchase_price" },
  {
    id: "usd",
    name: "US Fund",
    category: "Equities",
    currency: "USD",
    flows: [
      { date: "2020-01-01", amount: -1000 },
      { date: "2021-01-01", amount: 1100 },
    ],
    includes: { purchase: true, income: true, currentValue: true, financing: true },
  },
  {
    id: "wiggly",
    name: "Wiggly Deal",
    category: "Private Equity",
    currency: "AED",
    flows: [
      { date: "2020-01-01", amount: -1000 },
      { date: "2021-01-01", amount: 3000 },
      { date: "2022-01-01", amount: -2000 },
    ],
    includes: { purchase: true, income: true, currentValue: true, financing: true },
  },
];

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  localStorage.clear();
});

function renderIt(holdings = HOLDINGS) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <IrrCompare holdings={holdings} baseCurrency="AED" />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

const rate = (side: "a" | "b") => screen.getByTestId(`irr-${side}-rate`).textContent ?? "";

async function typeInto(testId: string, text: string) {
  const el = screen.getByTestId(testId);
  await userEvent.clear(el);
  if (text) await userEvent.type(el, text);
}

async function fillManual(side: "a" | "b", v: { initial: string; monthly: string; final: string; years: string }) {
  await typeInto(`irr-${side}-initial`, v.initial);
  await typeInto(`irr-${side}-monthly`, v.monthly);
  await typeInto(`irr-${side}-final`, v.final);
  await typeInto(`irr-${side}-years`, v.years);
}

async function pickHolding(side: "a" | "b", id: string) {
  await userEvent.click(screen.getByTestId(`irr-${side}-source-holding`));
  await userEvent.click(screen.getByTestId(`irr-${side}-holding`));
  await userEvent.click(await screen.findByTestId(`irr-${side}-option-${id}`));
}

describe("IrrCompare: manual vs manual", () => {
  it("shows the screenshot case at 2.89 % with deposits, interest and final capital", () => {
    renderIt();
    expect(rate("a")).toContain("2.89");
    expect(screen.getByTestId("irr-a-res-deposits").textContent).toContain("102,000");
    expect(screen.getByTestId("irr-a-res-interest").textContent).toMatch(/48,\d{3}/);
    expect(screen.getByTestId("irr-a-res-final").textContent).toContain("150,000");
    expect(screen.getByTestId("irr-b-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("irr-b-err-nothing")).toBeNull(); // an untouched side shows no error
    expect(screen.getByTestId("irr-panel-pending")).toBeInTheDocument();
  });

  it("recomputes live and fills the comparison with a neutral difference", async () => {
    renderIt();
    await fillManual("b", { initial: "10000", monthly: "0", final: "20000", years: "10" });
    expect(rate("b")).toMatch(/7\.18/);
    expect(screen.getByTestId("irr-panel-rate-a").textContent).toContain("2.89");
    expect(screen.getByTestId("irr-panel-rate-b").textContent).toMatch(/7\.18/);
    // A (2.89) - B (7.18) = -4.29 percentage points
    expect(screen.getByTestId("irr-panel-diff").textContent).toContain("-4.29");
    expect(screen.getByTestId("irr-row-in-a")).toBeInTheDocument();
    expect(screen.getByTestId("irr-row-multiple-b").textContent).toContain("2.00");
    expect(screen.getByTestId("irr-row-horizon-b").textContent).toContain("10");
    expect(screen.getByTestId("irr-warn-horizon")).toBeInTheDocument(); // 20 vs 10 years
    expect(screen.getByTestId("irr-chart-summary").textContent).toBeTruthy();
    expect(screen.getByRole("img", { name: /cumulative net position/i })).toBeInTheDocument();
  });

  it("has no horizon warning when both horizons match", async () => {
    renderIt();
    await fillManual("b", { initial: "10000", monthly: "100", final: "40000", years: "20" });
    expect(screen.queryByTestId("irr-warn-horizon")).toBeNull();
  });
});

describe("IrrCompare: holdings", () => {
  it("manual vs holding", async () => {
    renderIt();
    await pickHolding("b", "apple");
    expect(rate("b")).toMatch(/\d\.\d\d/);
    expect(screen.getByTestId("irr-panel-rate-b").textContent).toBe(rate("b"));
    const inc = screen.getByTestId("irr-b-includes");
    expect(within(inc).getByTestId("irr-b-inc-income").dataset.included).toBe("false");
    expect(within(inc).getByTestId("irr-b-inc-financing").dataset.included).toBe("true");
    expect(screen.getByTestId("irr-b-warn-income")).toBeInTheDocument();
    expect(screen.queryByTestId("irr-b-warn-financing")).toBeNull();
  });

  it("labels a fully sold position as closed rather than excluded", async () => {
    renderIt();
    await pickHolding("b", "sold");
    const value = screen.getByTestId("irr-b-inc-value");
    expect(value.dataset.included).toBe("false");
    expect(value.textContent).toMatch(/position closed/i);
    expect(value.textContent).not.toMatch(/not included/i);
  });

  it("holding vs holding, with a financing warning", async () => {
    renderIt();
    await pickHolding("a", "villa");
    await pickHolding("b", "apple");
    expect(rate("a")).toMatch(/\d/);
    expect(screen.getByTestId("irr-a-warn-financing")).toBeInTheDocument();
    expect(screen.queryByTestId("irr-a-warn-income")).toBeNull();
    expect(screen.getByTestId("irr-panel-diff").textContent).toMatch(/[+-]\d+\.\d\d/);
    // Apple: 10,000 -> 15,000 over 5 years = about 8.4 %
    expect(rate("b")).toMatch(/8\.4\d/);
  });

  it("keeps an unavailable holding visible, disabled, with its translated reason", async () => {
    renderIt();
    await userEvent.click(screen.getByTestId("irr-b-source-holding"));
    await userEvent.click(screen.getByTestId("irr-b-holding"));
    const option = await screen.findByTestId("irr-b-option-car");
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("irr-b-reason-car").textContent).toMatch(/purchase price/i);
    await userEvent.click(option);
    expect(screen.queryByTestId("irr-b-rate")).toBeNull();
    expect(screen.getByTestId("irr-b-option-apple")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("searches holdings by name", async () => {
    renderIt();
    await userEvent.click(screen.getByTestId("irr-b-source-holding"));
    await userEvent.click(screen.getByTestId("irr-b-holding"));
    await userEvent.type(await screen.findByPlaceholderText(/search your investments/i), "apple");
    await waitFor(() => expect(screen.queryByTestId("irr-b-option-villa")).toBeNull());
    expect(screen.getByTestId("irr-b-option-apple")).toBeInTheDocument();
  });

  it("explains when there are no holdings", async () => {
    renderIt([]);
    await userEvent.click(screen.getByTestId("irr-b-source-holding"));
    expect(screen.getByTestId("irr-b-no-holdings")).toBeInTheDocument();
  });

  it("warns when the currencies differ", async () => {
    renderIt();
    await pickHolding("b", "usd");
    expect(screen.getByTestId("irr-warn-currency").textContent).toMatch(/AED.*USD/);
  });

  it("flags flows that change sign more than once", async () => {
    renderIt();
    await pickHolding("b", "wiggly");
    expect(screen.getByTestId("irr-b-warn-multiple")).toBeInTheDocument();
    expect(screen.getByTestId("irr-warn-multiple")).toBeInTheDocument();
  });
});

describe("IrrCompare: validation", () => {
  it("shows field errors with aria wiring and no result", async () => {
    renderIt();
    await typeInto("irr-a-final", "abc");
    const final = screen.getByTestId("irr-a-final");
    expect(final).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("irr-a-err-final").id).toBe(final.getAttribute("aria-describedby"));
    expect(screen.queryByTestId("irr-a-rate")).toBeNull();
    await typeInto("irr-a-monthly", "-5");
    expect(screen.getByTestId("irr-a-err-monthly")).toBeInTheDocument();
    await typeInto("irr-a-years", "");
    await userEvent.tab();
    expect(screen.getByTestId("irr-a-err-years")).toBeInTheDocument();
    await typeInto("irr-a-final", "150000");
    expect(screen.queryByTestId("irr-a-err-final")).toBeNull();
  });

  it("asks for an initial capital or a monthly saving", async () => {
    renderIt();
    await typeInto("irr-a-initial", "0");
    await typeInto("irr-a-monthly", "0");
    expect(screen.getByTestId("irr-a-err-nothing")).toBeInTheDocument();
    expect(screen.queryByTestId("irr-a-rate")).toBeNull();
  });

  it("accepts French-style input in a French locale", async () => {
    localStorage.setItem("opes_locale", "fr");
    renderIt();
    await typeInto("irr-a-initial", "30 000");
    await typeInto("irr-a-monthly", "300,00");
    expect(rate("a")).toContain("2,89");
    localStorage.removeItem("opes_locale");
  });
});

describe("IrrCompare: wording and persistence", () => {
  it("never ranks the sides or advises", async () => {
    const { container } = renderIt();
    await fillManual("b", { initial: "10000", monthly: "0", final: "20000", years: "10" });
    await pickHolding("a", "apple");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\b(better|worse|best|worst|outperform\w*|underperform\w*|winner|wins?|recommend\w*|you should)\b/i);
    const note = screen.getByTestId("irr-disclaimer").textContent ?? "";
    expect(note).toMatch(/reinvested at the same rate/);
    expect(note).toMatch(/required return, not a performance/);
    expect(note).toMatch(/Not investment advice/);
  });

  it("remembers the last two selections", async () => {
    const first = renderIt();
    await fillManual("b", { initial: "10000", monthly: "0", final: "20000", years: "10" });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(saved.b.final).toBe("20000");
    first.unmount();
    renderIt();
    expect((screen.getByTestId("irr-b-final") as HTMLInputElement).value).toBe("20000");
    expect(rate("b")).toMatch(/7\.18/);
  });

  it("falls back to the defaults on corrupt storage", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    renderIt();
    expect(rate("a")).toContain("2.89");
  });
});
