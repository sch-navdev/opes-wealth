import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createGratuityPlan: vi.fn(),
  updateGratuityPlan: vi.fn(),
  deleteGratuityPlan: vi.fn(),
}));
vi.mock("@/app/dashboard/gratuity-actions", () => actions);

import { GratuityManager } from "@/components/gratuity-manager";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { EndOfServicePlan } from "@/lib/uae-gratuity";

const plan: EndOfServicePlan = {
  id: "p1",
  employer: "Invented Co",
  start_date: "2010-01-01",
  end_date: "2020-03-13",
  contract_type: "unlimited",
  unpaid_leave_days: 0,
  wage_history: [{ from: "2010-01-01", basicMonthly: 12000 }],
  payments: [{ date: "2020-01-01", amount: 90000, note: "" }],
  employer_stated_balance: 10000,
  currency: "AED",
  notes: "",
};

function renderIt(over: Partial<React.ComponentProps<typeof GratuityManager>> = {}) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <GratuityManager plans={[plan]} available asOf="2026-10-09" {...over} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  for (const m of Object.values(actions)) m.mockReset();
  actions.createGratuityPlan.mockResolvedValue({ ok: true, id: "n1" });
  actions.updateGratuityPlan.mockResolvedValue({ ok: true, id: "p1" });
  actions.deleteGratuityPlan.mockResolvedValue({ ok: true, id: "p1" });
});

describe("GratuityManager", () => {
  it("shows the informational line, free-zone and national warnings", () => {
    renderIt();
    expect(screen.getByText(/Informational only, not legal advice/)).toBeInTheDocument();
    expect(screen.getByText(/DIFC and ADGM/)).toBeInTheDocument();
    expect(screen.getByText(/UAE nationals/)).toBeInTheDocument();
  });

  it("computes entitlement, outstanding and the employer difference", () => {
    renderIt();
    expect(screen.getAllByText(/104,400\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/14,400\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/The employer states .* less than the calculation/)).toBeInTheDocument();
    expect(screen.getByText("10 years and 73 days")).toBeInTheDocument();
  });

  it("starts with a prompt when there is no plan", () => {
    renderIt({ plans: [] });
    expect(screen.getByText(/Enter a start date and at least one basic wage/)).toBeInTheDocument();
  });

  it("says not available yet and disables Save when the table is missing", () => {
    renderIt({ plans: [], available: false });
    expect(screen.getByText(/not available yet on this database/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("is read-only in demo mode", () => {
    renderIt({ readOnly: true });
    expect(screen.getByText("Demo mode: changes are not saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves an edited plan through the action", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.updateGratuityPlan).toHaveBeenCalledTimes(1);
    expect(actions.updateGratuityPlan.mock.calls[0][0]).toBe("p1");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("shows a validation error and does not call the action", async () => {
    const user = userEvent.setup();
    renderIt({ plans: [] });
    await user.type(screen.getByLabelText("Employer"), "X");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.createGratuityPlan).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid start date.");
  });

  it("confirms before deleting", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole("button", { name: "Delete employment" }));
    expect(actions.deleteGratuityPlan).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(actions.deleteGratuityPlan).toHaveBeenCalledWith("p1");
  });
});
