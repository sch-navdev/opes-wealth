import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AssuranceVieDetailCards, AssuranceVieEstateCard, AssuranceVieMilestoneCard } from "@/components/assurance-vie-cards";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { EMPTY_ASSURANCE_VIE_METADATA, type AssuranceVieMetadata } from "@/lib/assurance-vie";

const md = (over: Partial<AssuranceVieMetadata> = {}): AssuranceVieMetadata => ({ ...EMPTY_ASSURANCE_VIE_METADATA, ...over });

const wrap = (ui: React.ReactElement) =>
  render(
    <LanguageProvider>
      <PrivacyProvider>{ui}</PrivacyProvider>
    </LanguageProvider>,
  );

beforeEach(() => localStorage.removeItem("opes_privacy_mode"));
afterEach(() => localStorage.removeItem("opes_privacy_mode"));

describe("AssuranceVieMilestoneCard", () => {
  it("asks for the opening date when it is missing", () => {
    wrap(<AssuranceVieMilestoneCard metadata={md()} today="2026-10-07" />);
    expect(screen.getByTestId("av-milestone-unset")).toHaveTextContent("Add the contract opening date");
    expect(screen.queryByTestId("av-milestone-badge")).toBeNull();
  });

  it("before the 8 years: shows the countdown and the future allowance, not the reached card", () => {
    wrap(<AssuranceVieMilestoneCard metadata={md({ opened_on: "2018-03-15", household: "single" })} today="2025-12-20" />);
    expect(screen.getByTestId("av-milestone-badge")).toHaveAttribute("data-status", "before");
    expect(screen.getByTestId("av-milestone-badge")).toHaveTextContent("Before 8 years");
    expect(screen.getByTestId("av-days-remaining")).toHaveTextContent("85");
    expect(screen.getByTestId("av-months-remaining")).toHaveTextContent("2");
    expect(screen.getByText("8th anniversary: March 15, 2026")).toBeInTheDocument();
    expect(screen.getByTestId("av-milestone-before-text")).toHaveTextContent("may benefit from an annual allowance");
    expect(screen.queryByTestId("av-allowance")).toBeNull();
    expect(screen.queryByTestId("av-days-since")).toBeNull();
  });

  it("on the anniversary day the milestone is reached", () => {
    wrap(<AssuranceVieMilestoneCard metadata={md({ opened_on: "2018-03-15" })} today="2026-03-15" />);
    expect(screen.getByTestId("av-milestone-badge")).toHaveAttribute("data-status", "reached");
    expect(screen.getByTestId("av-days-since")).toHaveTextContent("0");
  });

  it("reached, single filer: 4,600 EUR allowance on the gains part of withdrawals", () => {
    wrap(<AssuranceVieMilestoneCard metadata={md({ opened_on: "2010-01-01", household: "single" })} today="2026-10-07" />);
    expect(screen.getByTestId("av-milestone-badge")).toHaveTextContent("8 years reached");
    const text = screen.getByTestId("av-allowance-text");
    expect(text).toHaveTextContent("€4,600");
    expect(text).toHaveTextContent("single filer");
    expect(text).toHaveTextContent("gains part of withdrawals");
    expect(text).toHaveTextContent("not a general capital-gains exemption");
    expect(text).toHaveTextContent("does not exempt the whole contract");
  });

  it("reached, couple taxed jointly: 9,200 EUR", () => {
    wrap(<AssuranceVieMilestoneCard metadata={md({ opened_on: "2010-01-01", household: "couple" })} today="2026-10-07" />);
    const text = screen.getByTestId("av-allowance-text");
    expect(text).toHaveTextContent("€9,200");
    expect(text).toHaveTextContent("jointly taxed couple");
    expect(text).not.toHaveTextContent("€4,600");
  });

  it("always states it is informational, residency-dependent and as of a date, and computes no tax amount", () => {
    wrap(<AssuranceVieMilestoneCard metadata={md({ opened_on: "2010-01-01", premiums_paid_total: 100_000 })} today="2026-10-07" />);
    const disclaimer = screen.getByTestId("av-milestone-disclaimer");
    expect(disclaimer).toHaveTextContent("Informational only, not tax advice");
    expect(disclaimer).toHaveTextContent("French tax residents");
    expect(disclaimer).toHaveTextContent("tax residency");
    expect(disclaimer).toHaveTextContent("Check current rules");
    expect(disclaimer).toHaveTextContent("Figures as of October 7, 2026");
    expect(screen.getByTestId("av-milestone").textContent).not.toMatch(/100,000/);
  });

  it("shows the neutral age-70 line only when the split is present, without amounts", () => {
    const { unmount } = wrap(<AssuranceVieMilestoneCard metadata={md({ opened_on: "2010-01-01" })} today="2026-10-07" />);
    expect(screen.queryByTestId("av-age70-note")).toBeNull();
    unmount();
    wrap(<AssuranceVieMilestoneCard metadata={md({ opened_on: "2010-01-01", premiums_before_70: 12_345 })} today="2026-10-07" />);
    const note = screen.getByTestId("av-age70-note");
    expect(note).toHaveTextContent("different allowance regimes");
    expect(note).toHaveTextContent("No amounts are computed here");
    expect(note.textContent).not.toMatch(/12,345/);
  });
});

describe("AssuranceVieDetailCards", () => {
  const contract = md({
    insurer: "Insurer X",
    contract_name: "Plan Épargne",
    contract_number: "AV-123",
    opened_on: "2018-03-15",
    household: "couple",
    euro_fund_pct: 70,
    uc_pct: 30,
    deposit_type: "scheduled",
    premiums_paid_total: 40_000,
    scheduled_amount: 500,
    scheduled_frequency: "monthly",
    scheduled_day: 5,
    scheduled_start_on: "2019-01-05",
    beneficiaries: [
      { id: "a", name: "Alice", relationship: "spouse", share_pct: 60, clause: "standard", clause_text: "" },
      { id: "b", name: "Bob", relationship: "son", share_pct: 30, clause: "free_text", clause_text: "Bob or his children" },
    ],
  });
  const renderCards = () => wrap(<AssuranceVieDetailCards metadata={contract} assetValue={50_000} currency="EUR" today="2026-10-07" />);

  it("renders the contract summary, allocation, deposits, milestone and beneficiaries", () => {
    renderCards();
    const summary = screen.getByTestId("av-summary");
    expect(summary).toHaveTextContent("Insurer X");
    expect(summary).toHaveTextContent("Plan Épargne");
    expect(summary).toHaveTextContent("AV-123");
    expect(summary).toHaveTextContent("March 15, 2018");
    expect(summary).toHaveTextContent("€50,000.00");

    expect(screen.getByTestId("av-allocation-bar")).toHaveAccessibleName("Allocation: 70% euro fund, 30% unit-linked");
    expect(within(screen.getByTestId("av-alloc-euro")).getByText("70%")).toBeInTheDocument();
    expect(screen.getByTestId("av-alloc-euro")).toHaveTextContent("€35,000.00");
    expect(screen.getByTestId("av-alloc-uc")).toHaveTextContent("€15,000.00");

    const deposits = screen.getByTestId("av-deposits");
    expect(deposits).toHaveTextContent("Scheduled premiums");
    expect(deposits).toHaveTextContent("Monthly: €500.00, on day 5 of the month");
    expect(screen.getByTestId("av-scheduled-annual")).toHaveTextContent("About €6,000.00 per year");

    expect(screen.getByTestId("av-milestone-badge")).toHaveAttribute("data-status", "reached");
    expect(screen.getByTestId("av-allowance-text")).toHaveTextContent("€9,200");

    expect(screen.getAllByTestId("av-bene-item")).toHaveLength(2);
    expect(screen.getByTestId("av-beneficiaries")).toHaveTextContent("Bob or his children");
    expect(screen.getByTestId("av-bene-total")).toHaveTextContent("Shares total: 90%");
    expect(within(screen.getByTestId("av-beneficiaries")).getByRole("status")).toHaveTextContent("not 100%");
    expect(screen.getByTestId("av-scope-note")).toHaveTextContent("Unit-linked holdings, ISINs and live pricing are not tracked");
  });

  it("masks every money value in privacy mode but leaves labels and percentages", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderCards();
    const detail = screen.getByTestId("av-detail");
    expect(detail.textContent).not.toMatch(/50,000|35,000|15,000|40,000|500\.00|6,000/);
    expect(detail.textContent).toContain("••••••••");
    expect(screen.getByTestId("av-alloc-euro")).toHaveTextContent("70%");
  });

  it("handles an empty contract (free deposits, no beneficiaries, no date)", () => {
    wrap(<AssuranceVieDetailCards metadata={md()} assetValue={0} currency="EUR" today="2026-10-07" />);
    expect(screen.getByText("No beneficiaries recorded.")).toBeInTheDocument();
    expect(screen.getByTestId("av-milestone-unset")).toBeInTheDocument();
    expect(screen.queryByTestId("av-scheduled-annual")).toBeNull();
  });
});

describe("AssuranceVieEstateCard", () => {
  const people = [
    { id: "a", name: "Alice", relationship: "spouse", share_pct: 50, clause: "standard" as const, clause_text: "" },
    { id: "b", name: "Bob", relationship: "son", share_pct: 50, clause: "standard" as const, clause_text: "" },
  ];

  it("shows both allowances and the disclaimer, and asks for beneficiaries when none is named", () => {
    wrap(<AssuranceVieEstateCard metadata={md()} />);
    const card = screen.getByTestId("av-estate");
    expect(screen.getByTestId("av-estate-before70")).toHaveTextContent("before age 70 (article 990 I)");
    expect(screen.getByTestId("av-estate-before70")).toHaveTextContent("€152,500 per beneficiary");
    expect(screen.getByTestId("av-estate-after70")).toHaveTextContent("after age 70 (article 757 B)");
    expect(screen.getByTestId("av-estate-after70")).toHaveTextContent("€30,500");
    expect(screen.getByTestId("av-estate-after70")).toHaveTextContent("gains they produced are outside it");
    expect(screen.getByTestId("av-estate-no-bene")).toBeInTheDocument();
    expect(screen.queryByTestId("av-estate-arith-before")).toBeNull();
    expect(screen.queryByTestId("av-estate-arith-after")).toBeNull();
    const disclaimer = screen.getByTestId("av-estate-disclaimer");
    expect(disclaimer).toHaveTextContent("Informational, not tax advice");
    expect(disclaimer).toHaveTextContent("UAE residents are treated differently");
    expect(disclaimer).toHaveTextContent("Check current rules");
    expect(disclaimer).toHaveTextContent("Figures as of October 7, 2026");
    expect(disclaimer).toHaveTextContent("no tax amount is computed");
    expect(card.textContent).not.toMatch(/you owe|tax due|payable/i);
  });

  it("shows the arithmetic for the named beneficiaries", () => {
    wrap(<AssuranceVieEstateCard metadata={md({ beneficiaries: people })} />);
    expect(screen.getByTestId("av-estate-arith-before")).toHaveTextContent("Named beneficiaries: 2. €152,500 x 2 = €305,000");
    expect(screen.getByTestId("av-estate-arith-after")).toHaveTextContent("€30,500 / 2 = €15,250.00 each if split equally");
    expect(screen.getByTestId("av-estate-arith-after")).toHaveTextContent("allowance is overall, not per person");
    expect(screen.queryByTestId("av-estate-no-bene")).toBeNull();
  });

  it("is part of the detail cards, ignores premium amounts and stays visible in privacy mode", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    wrap(
      <AssuranceVieDetailCards
        metadata={md({ beneficiaries: people, premiums_before_70: 777_000, premiums_after_70: 88_000 })}
        assetValue={50_000}
        currency="EUR"
        today="2026-10-07"
      />,
    );
    const card = screen.getByTestId("av-estate");
    expect(card).toHaveTextContent("€152,500");
    expect(card.textContent).not.toMatch(/777,000|88,000/);
  });
});
