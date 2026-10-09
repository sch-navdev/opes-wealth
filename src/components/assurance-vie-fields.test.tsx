import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AssuranceVieFields } from "@/components/assurance-vie-fields";
import { LanguageProvider } from "@/context/language-context";
import { EMPTY_ASSURANCE_VIE_METADATA, type AssuranceVieMetadata } from "@/lib/assurance-vie";

function Harness({
  initial = EMPTY_ASSURANCE_VIE_METADATA,
  assetValue = null,
  showErrors = false,
  spy,
}: {
  initial?: AssuranceVieMetadata;
  assetValue?: number | null;
  showErrors?: boolean;
  spy?: (next: AssuranceVieMetadata) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <LanguageProvider>
      <AssuranceVieFields
        value={value}
        onChange={(next) => {
          setValue(next);
          spy?.(next);
        }}
        currency="EUR"
        assetValue={assetValue}
        showErrors={showErrors}
      />
    </LanguageProvider>
  );
}

const setup = (props: Parameters<typeof Harness>[0] = {}) => {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  return user;
};

describe("AssuranceVieFields: contract section", () => {
  it("renders the labelled contract fields", () => {
    setup();
    expect(screen.getByTestId("av-fields")).toBeInTheDocument();
    for (const label of ["Insurer", "Contract name", "Contract number (optional)", "Contract opening date"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("radiogroup", { name: "Tax household status" })).toBeInTheDocument();
    expect(screen.getByText("The 8-year milestone is counted from this date, not from each premium.")).toBeInTheDocument();
  });

  it("switches the household status with a segmented control", async () => {
    const spy = vi.fn();
    const user = setup({ spy });
    const single = screen.getByRole("radio", { name: "Single filer" });
    const couple = screen.getByRole("radio", { name: "Couple taxed jointly (married or PACS)" });
    expect(single).toHaveAttribute("aria-checked", "true");
    await user.click(couple);
    expect(couple).toHaveAttribute("aria-checked", "true");
    expect(single).toHaveAttribute("aria-checked", "false");
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ household: "couple" }));
  });

  it("flags an opening date in the future", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Contract opening date"), "2099-01-01");
    expect(await screen.findByText("The opening date cannot be in the future.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contract opening date")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("AssuranceVieFields: allocation", () => {
  it("keeps the euro-fund and unit-linked inputs linked so they always total 100", async () => {
    const spy = vi.fn();
    const user = setup({ spy });
    const euro = screen.getByLabelText("Euro fund (Fonds en euros)");
    const uc = screen.getByLabelText("Unit-linked (Unités de compte)");
    expect(euro).toHaveValue(100);
    expect(uc).toHaveValue(0);

    await user.clear(euro);
    await user.type(euro, "70");
    expect(uc).toHaveValue(30);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ euro_fund_pct: 70, uc_pct: 30 }));

    await user.clear(uc);
    await user.type(uc, "45.5");
    expect(euro).toHaveValue(54.5);
    expect(screen.getByTestId("av-alloc-total")).toHaveTextContent("Total: 100%");
  });

  it("clamps an out-of-range entry instead of breaking the total", async () => {
    const spy = vi.fn();
    const user = setup({ spy });
    const euro = screen.getByLabelText("Euro fund (Fonds en euros)");
    await user.clear(euro);
    await user.type(euro, "150");
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ euro_fund_pct: 100, uc_pct: 0 }));
  });

  it("words the euro-fund guarantee as the insurer's and the unit-linked part as unguaranteed", () => {
    setup();
    expect(screen.getByText(/capital guarantee is given by the insurer/)).toBeInTheDocument();
    expect(screen.getByText(/no capital guarantee/)).toBeInTheDocument();
  });

  it("draws a two-segment bar and shows the implied amounts from the asset value", () => {
    setup({ initial: { ...EMPTY_ASSURANCE_VIE_METADATA, euro_fund_pct: 60, uc_pct: 40 }, assetValue: 10_000 });
    expect(screen.getByTestId("av-allocation-bar")).toHaveAccessibleName("Allocation: 60% euro fund, 40% unit-linked");
    expect(screen.getByTestId("av-bar-euro")).toHaveStyle({ width: "60%" });
    expect(screen.getByTestId("av-bar-uc")).toHaveStyle({ width: "40%" });
    expect(screen.getByTestId("av-implied-euro")).toHaveTextContent("€6,000.00");
    expect(screen.getByTestId("av-implied-uc")).toHaveTextContent("€4,000.00");
  });

  it("shows no implied amounts without an asset value", () => {
    setup({ assetValue: null });
    expect(screen.queryByTestId("av-implied-euro")).toBeNull();
  });
});

describe("AssuranceVieFields: premiums", () => {
  it("shows the programmed-premium fields only for the scheduled deposit type", async () => {
    const user = setup();
    expect(screen.getByRole("radio", { name: "Free premiums (Versements libres)" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("av-scheduled")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Scheduled premiums (Versements programmés)" }));
    const scheduled = screen.getByTestId("av-scheduled");
    for (const label of ["Amount per premium", "Day of the month", "Start date (optional)", "End date (optional)"]) {
      expect(within(scheduled).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(scheduled).getByRole("radio", { name: "Monthly" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(scheduled).getByRole("radio", { name: "Quarterly" }));
    expect(within(scheduled).getByRole("radio", { name: "Quarterly" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: "Free premiums (Versements libres)" }));
    expect(screen.queryByTestId("av-scheduled")).toBeNull();
  });

  it("moves between deposit types with the arrow keys", async () => {
    const user = setup();
    screen.getByRole("radio", { name: "Free premiums (Versements libres)" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Scheduled premiums (Versements programmés)" })).toHaveAttribute("aria-checked", "true");
  });

  it("validates the programmed premium and clears the messages once fixed", async () => {
    const user = setup({ initial: { ...EMPTY_ASSURANCE_VIE_METADATA, deposit_type: "scheduled" }, showErrors: true });
    expect(screen.getByText("Enter the amount of each scheduled premium.")).toBeInTheDocument();
    expect(screen.getByText("Enter a day of the month between 1 and 31.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Amount per premium"), "250");
    await user.type(screen.getByLabelText("Day of the month"), "40");
    expect(screen.queryByText("Enter the amount of each scheduled premium.")).toBeNull();
    expect(screen.getByText("Enter a day of the month between 1 and 31.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Day of the month"));
    await user.type(screen.getByLabelText("Day of the month"), "5");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rejects an end date before the start date", async () => {
    const user = setup({ initial: { ...EMPTY_ASSURANCE_VIE_METADATA, deposit_type: "scheduled", scheduled_amount: 10, scheduled_day: 3 } });
    await user.type(screen.getByLabelText("Start date (optional)"), "2024-06-01");
    await user.type(screen.getByLabelText("End date (optional)"), "2024-05-01");
    expect(await screen.findByText(/end must not be before the start/)).toBeInTheDocument();
  });

  it("flags a negative premium amount and warns when the age split exceeds the total", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Total premiums paid (optional)"), "100");
    await user.type(screen.getByLabelText("Paid before age 70"), "80");
    await user.type(screen.getByLabelText("Paid after age 70"), "50");
    expect(screen.getByText("Premiums before and after age 70 add up to more than the total premiums paid.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Paid after age 70"));
    await user.type(screen.getByLabelText("Paid after age 70"), "-5");
    expect(await screen.findByText("Premium amounts must be zero or more.")).toBeInTheDocument();
  });
});

describe("AssuranceVieFields: beneficiaries", () => {
  it("shows the privacy note about third-party names", () => {
    setup();
    expect(screen.getByTestId("av-bene-privacy")).toHaveTextContent("stored only in this asset's record");
  });

  it("adds and removes beneficiaries with a running share total", async () => {
    const user = setup();
    expect(screen.queryByTestId("av-bene-row")).toBeNull();
    expect(screen.queryByTestId("av-bene-total")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add a beneficiary" }));
    await user.click(screen.getByRole("button", { name: "Add a beneficiary" }));
    expect(screen.getAllByTestId("av-bene-row")).toHaveLength(2);

    const names = screen.getAllByLabelText("Beneficiary name");
    const shares = screen.getAllByLabelText("Share (%)");
    await user.type(names[0], "Alice");
    await user.type(shares[0], "60");
    expect(screen.getByTestId("av-bene-total")).toHaveTextContent("Shares total: 60%");
    expect(screen.getByTestId("av-bene-warning")).toHaveTextContent("add up to 60%, not 100%");

    await user.type(names[1], "Bob");
    await user.type(shares[1], "40");
    expect(screen.getByTestId("av-bene-total")).toHaveTextContent("Shares total: 100%");
    expect(screen.queryByTestId("av-bene-warning")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Remove beneficiary 1" }));
    expect(screen.getAllByTestId("av-bene-row")).toHaveLength(1);
    expect(screen.getByLabelText("Beneficiary name")).toHaveValue("Bob");
    expect(screen.getByTestId("av-bene-total")).toHaveTextContent("Shares total: 40%");
  });

  it("offers the free-text clause field only for a free-text clause", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add a beneficiary" }));
    expect(screen.queryByLabelText("Clause wording")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Free-text clause" }));
    await user.type(screen.getByLabelText("Clause wording"), "My spouse, failing which my children");
    expect(screen.getByLabelText("Clause wording")).toHaveValue("My spouse, failing which my children");
  });

  it("flags a share outside 0 to 100 and a share without a name", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add a beneficiary" }));
    await user.type(screen.getByLabelText("Share (%)"), "120");
    expect(await screen.findByText("Give each beneficiary a name, or remove the row.")).toBeInTheDocument();
    expect(screen.getByText("Each beneficiary share must be between 0 and 100%.")).toBeInTheDocument();
  });
});

describe("AssuranceVieFields: contract holdings", () => {
  it("adds a typed row, derives the percentages and locks the manual inputs", async () => {
    const spy = vi.fn();
    const user = setup({ spy, assetValue: 1000 });
    await user.selectOptions(screen.getByLabelText("Type of holding to add"), "euro_fund");
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    expect(screen.getAllByTestId("av-hold-row")).toHaveLength(1);
    await user.type(screen.getByLabelText("Name, holding 1"), "Fonds Euro Demo");
    await user.type(screen.getByLabelText("Value, holding 1"), "700");
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    await user.selectOptions(screen.getByLabelText("Type, holding 2"), "etf");
    await user.type(screen.getByLabelText("Name, holding 2"), "World ETF Demo");
    await user.type(screen.getByLabelText("Units, holding 2"), "3");
    await user.type(screen.getByLabelText("Unit price, holding 2"), "100");
    expect(screen.getByLabelText("Value, holding 2")).toHaveValue(300);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ euro_fund_pct: 70, uc_pct: 30 }));
    expect(screen.getByLabelText("Euro fund (Fonds en euros)")).toHaveAttribute("readonly");
    expect(screen.getByTestId("av-alloc-locked")).toBeInTheDocument();
    expect(screen.getByTestId("av-hold-recon")).toHaveAttribute("data-state", "match");
  });

  it("reconciliation difference never blocks and holds a neutral note", async () => {
    const user = setup({ assetValue: 5000 });
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    await user.type(screen.getByLabelText("Name, holding 1"), "Fund");
    await user.type(screen.getByLabelText("Value, holding 1"), "100");
    expect(screen.getByTestId("av-hold-recon")).toHaveAttribute("data-state", "under");
    expect(screen.getByText(/A difference is normal/)).toBeInTheDocument();
  });

  it("flags a missing name and removes a row", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Add holding" }));
    await user.type(screen.getByLabelText("Value, holding 1"), "10");
    expect(await screen.findByText("Give each holding a name, or remove the row.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove holding 1" }));
    expect(screen.queryAllByTestId("av-hold-row")).toHaveLength(0);
    expect(screen.getByLabelText("Euro fund (Fonds en euros)")).not.toHaveAttribute("readonly");
  });
});
