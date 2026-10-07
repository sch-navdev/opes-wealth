import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams("currency=EUR&x=1"),
}));

import { FxExposureBar, FX_PEG_STORAGE_KEY } from "@/components/fx-exposure-bar";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { FxExposureInput } from "@/lib/fx-exposure";

const heavyUsd: FxExposureInput[] = [
  { currency: "EUR", assets: 300, liabilities: 0 },
  { currency: "USD", assets: 620, liabilities: 0 },
  { currency: "AED", assets: 80, liabilities: 0 },
];

function renderBar(rows: FxExposureInput[], baseCurrency = "EUR") {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <FxExposureBar rows={rows} baseCurrency={baseCurrency} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

const disclosure = () => screen.getByRole("button", { name: /show details|hide details/i });

beforeEach(() => {
  localStorage.clear();
  nav.push.mockReset();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

describe("collapsed", () => {
  it("shows the headline facts and keeps the details closed with an accessible disclosure", () => {
    renderBar(heavyUsd);
    expect(screen.getByRole("heading", { name: "Global exposure" })).toBeTruthy();
    expect(disclosure()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("fx-details")).toBeNull();
    expect(screen.getByTestId("fx-net-worth").textContent).toMatch(/1,000/);
    // 70 % of net worth sits outside EUR
    expect(screen.getByTestId("fx-international").textContent).toBe("70 %");
  });

  it("marks the active base currency chip as pressed", () => {
    renderBar(heavyUsd, "USD");
    const group = screen.getByRole("group", { name: "Base currency" });
    expect(within(group).getByRole("button", { name: "Show amounts in USD" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Show amounts in EUR" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("button", { name: "Show amounts in AED" })).toHaveAttribute("aria-pressed", "false");
  });

  it("still offers the full currency switcher for other currencies", () => {
    renderBar(heavyUsd);
    expect(screen.getByRole("combobox", { name: "Other currencies" })).toBeTruthy();
  });
});

describe("base currency chips", () => {
  it("navigate exactly like the header switcher: same path, ?currency= set, other params kept", async () => {
    renderBar(heavyUsd);
    await userEvent.click(screen.getByRole("button", { name: "Show amounts in AED" }));
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith("/dashboard?currency=AED&x=1");
  });

  it("does nothing when the active currency is clicked again", async () => {
    renderBar(heavyUsd);
    await userEvent.click(screen.getByRole("button", { name: "Show amounts in EUR" }));
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("expanded", () => {
  it("shows the net breakdown and assets vs liabilities per currency, with totals", async () => {
    const user = userEvent.setup();
    renderBar([
      { currency: "EUR", assets: 700, liabilities: 100 },
      { currency: "USD", assets: 300, liabilities: 0 },
    ]);
    await user.click(disclosure());
    expect(disclosure()).toHaveAttribute("aria-expanded", "true");
    expect(disclosure().getAttribute("aria-controls")).toBe(screen.getByTestId("fx-details").id);

    const eurBreakdown = screen.getByTestId("fx-breakdown-EUR");
    expect(eurBreakdown.textContent).toMatch(/600/);
    expect(eurBreakdown.textContent).toMatch(/66\.7 %/);
    expect(within(eurBreakdown).getByText("Base")).toBeTruthy();

    const row = within(screen.getByTestId("fx-row-EUR")).getAllByRole("cell").map((c) => c.textContent);
    expect(row[0]).toMatch(/700/);
    expect(row[1]).toMatch(/100/);
    expect(row[2]).toMatch(/600/);
    const total = within(screen.getByTestId("fx-row-total")).getAllByRole("cell").map((c) => c.textContent);
    expect(total[0]).toMatch(/1,000/);
    expect(total[1]).toMatch(/100/);
    expect(total[2]).toMatch(/900/);

    await user.click(disclosure());
    expect(screen.queryByTestId("fx-details")).toBeNull();
    expect(disclosure()).toHaveAttribute("aria-expanded", "false");
  });

  it("says so when there are no liabilities", async () => {
    renderBar([{ currency: "EUR", assets: 100, liabilities: 0 }]);
    await userEvent.click(disclosure());
    expect(screen.getByTestId("fx-no-liabilities")).toBeTruthy();
  });

  it("does not say so when there are liabilities", async () => {
    renderBar([{ currency: "EUR", assets: 100, liabilities: 10 }]);
    await userEvent.click(disclosure());
    expect(screen.queryByTestId("fx-no-liabilities")).toBeNull();
  });
});

describe("AED / USD peg grouping", () => {
  it("is off by default and merges the two into one block when switched on, remembered in localStorage", async () => {
    const user = userEvent.setup();
    renderBar(heavyUsd);
    await user.click(disclosure());
    expect(screen.getByTestId("fx-row-USD")).toBeTruthy();
    expect(screen.getByTestId("fx-row-AED")).toBeTruthy();

    await user.click(screen.getByRole("switch", { name: /group aed and usd/i }));
    expect(screen.queryByTestId("fx-row-USD")).toBeNull();
    expect(screen.queryByTestId("fx-row-AED")).toBeNull();
    const merged = screen.getByTestId("fx-row-AED+USD");
    expect(merged.textContent).toMatch(/AED \+ USD/);
    expect(merged.textContent).toMatch(/700/);
    expect(localStorage.getItem(FX_PEG_STORAGE_KEY)).toBe("true");

    await user.click(screen.getByRole("switch", { name: /group aed and usd/i }));
    expect(screen.getByTestId("fx-row-USD")).toBeTruthy();
    expect(localStorage.getItem(FX_PEG_STORAGE_KEY)).toBe("false");
  });

  it("starts grouped when the preference was saved", async () => {
    localStorage.setItem(FX_PEG_STORAGE_KEY, "true");
    renderBar(heavyUsd);
    expect(screen.getByRole("switch", { name: /group aed and usd/i })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(disclosure());
    expect(screen.getByTestId("fx-row-AED+USD")).toBeTruthy();
  });

  it("changes the international share: with base USD the pegged AED counts as base", async () => {
    const user = userEvent.setup();
    renderBar(heavyUsd, "USD");
    expect(screen.getByTestId("fx-international").textContent).toBe("38 %");
    await user.click(screen.getByRole("switch", { name: /group aed and usd/i }));
    expect(screen.getByTestId("fx-international").textContent).toBe("30 %");
  });

  it("still works when localStorage throws", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      renderBar(heavyUsd);
      await userEvent.click(screen.getByRole("switch", { name: /group aed and usd/i }));
      expect(screen.getByRole("switch", { name: /group aed and usd/i })).toBeTruthy();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe("concentration note", () => {
  it("shows a neutral chip and a natural-hedging explanation when one non-base currency exceeds 50 %", async () => {
    renderBar(heavyUsd);
    const chip = screen.getByTestId("fx-concentration");
    expect(chip.textContent).toMatch(/Concentrated in USD: 62 % of net worth/);
    expect(chip.firstElementChild!.textContent).not.toMatch(/rebalance|transfer|should|recommend/i);
    await userEvent.click(within(chip).getByRole("button", { name: "About natural hedging" }));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toMatch(/offsets assets/);
    expect(tip.textContent).toMatch(/not a recommendation/);
  });

  it("is absent when the concentration is in the base currency or below the threshold", () => {
    renderBar(heavyUsd, "USD");
    expect(screen.queryByTestId("fx-concentration")).toBeNull();
  });

  it("peg grouping can bring up a concentration that single currencies hide", async () => {
    renderBar([
      { currency: "EUR", assets: 400, liabilities: 0 },
      { currency: "USD", assets: 300, liabilities: 0 },
      { currency: "AED", assets: 300, liabilities: 0 },
    ]);
    expect(screen.queryByTestId("fx-concentration")).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: /group aed and usd/i }));
    expect(screen.getByTestId("fx-concentration").textContent).toMatch(/AED \+ USD: 60 %/);
  });
});

describe("edge cases", () => {
  it("negative net worth: gross-based shares with a neutral note and no NaN or Infinity", async () => {
    renderBar([
      { currency: "EUR", assets: 100, liabilities: 300 },
      { currency: "USD", assets: 100, liabilities: 0 },
    ]);
    expect(screen.getByTestId("fx-gross-note")).toBeTruthy();
    expect(screen.getByTestId("fx-international").textContent).toBe("20 %");
    await userEvent.click(disclosure());
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("shows an empty state without a disclosure when there is nothing to show", () => {
    renderBar([]);
    expect(screen.getByText("No holdings to show yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show details/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("a liability that exceeds the assets of a currency shows a negative net position", async () => {
    renderBar([
      { currency: "EUR", assets: 1000, liabilities: 0 },
      { currency: "USD", assets: 100, liabilities: 400 },
    ]);
    await userEvent.click(disclosure());
    const net = within(screen.getByTestId("fx-row-USD")).getAllByRole("cell")[2].textContent!;
    expect(net).toMatch(/300/);
    expect(net).toMatch(/-|−/);
  });
});

describe("privacy mode", () => {
  it("masks money everywhere but keeps shares and labels", async () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderBar(heavyUsd);
    expect(screen.getByTestId("fx-net-worth").textContent).toBe("••••••••");
    await userEvent.click(disclosure());
    expect(screen.getByTestId("fx-breakdown-USD").textContent).toMatch(/••••••••/);
    expect(screen.getByTestId("fx-breakdown-USD").textContent).toMatch(/62 %/);
    expect(screen.getByTestId("fx-details").textContent).not.toMatch(/620/);
    for (const cell of within(screen.getByTestId("fx-row-total")).getAllByRole("cell").slice(0, 3)) {
      expect(cell.textContent).toBe("••••••••");
    }
  });
});
