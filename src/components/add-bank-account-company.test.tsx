import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { AddBankAccountDialog } from "@/components/add-bank-account-dialog";

vi.mock("@/app/dashboard/actions", () => ({ addBankAccount: vi.fn() }));

// Invented fixtures only.
function open(props: React.ComponentProps<typeof AddBankAccountDialog>) {
  render(
    <LanguageProvider>
      <AddBankAccountDialog {...props} />
    </LanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
}

describe("AddBankAccountDialog company link", () => {
  it("offers an optional Company field with the hint when the user has companies", async () => {
    open({ companies: [{ id: "co1", name: "Acme Trading LLC" }] });
    expect(await screen.findByLabelText("Company (optional)")).toBeInTheDocument();
    expect(screen.getByText(/not as personal cash/)).toBeInTheDocument();
    // defaults to "no company": a personal account
    expect(screen.getByLabelText("Company (optional)")).toHaveTextContent("None: personal account");
  });

  it("preselects the company when opened from a company's button", async () => {
    open({
      companies: [{ id: "co1", name: "Acme Trading LLC" }],
      defaultCompanyId: "co1",
      trigger: <button type="button">Add company bank account</button>,
    });
    expect(await screen.findByLabelText("Company (optional)")).toHaveTextContent("Acme Trading LLC");
  });

  it("has no Company field without companies (the dashboard Cash card dialog is unchanged)", async () => {
    open({});
    await screen.findByRole("dialog");
    expect(screen.queryByLabelText("Company (optional)")).toBeNull();
  });
});
