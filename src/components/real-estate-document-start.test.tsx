import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { LanguageProvider } from "@/context/language-context";
import { EMPTY_REAL_ESTATE_METADATA, type RealEstateMetadata } from "@/lib/real-estate";

const read = vi.hoisted(() => ({ readRealEstateDocument: vi.fn() }));
vi.mock("@/app/dashboard/real-estate-document-actions", () => read);

import { RealEstateDocumentStart } from "@/components/real-estate-document-start";

let latest: RealEstateMetadata = EMPTY_REAL_ESTATE_METADATA;
function Harness() {
  const [value, setValue] = useState<RealEstateMetadata>(EMPTY_REAL_ESTATE_METADATA);
  return (
    <LanguageProvider>
      <RealEstateDocumentStart value={value} onChange={(next) => { latest = next; setValue(next); }} />
    </LanguageProvider>
  );
}

const pdf = (name: string) => new File(["%PDF-1.4"], name, { type: "application/pdf" });
const choose = (file: File) => fireEvent.change(screen.getByTestId("re-doc-input"), { target: { files: [file] } });

describe("RealEstateDocumentStart", () => {
  it("fills the empty form fields from a title deed and lists what was read", async () => {
    read.readRealEstateDocument.mockResolvedValueOnce({
      ok: true,
      kind: "property",
      documentType: "dubai_title_deed",
      fileName: "deed.pdf",
      patch: { emirate: "dubai", purchasePrice: 3400000, surfaceArea: 121, address: "Ellington House 1 - Unit 713" },
    });
    render(<Harness />);
    choose(pdf("deed.pdf"));
    await screen.findByText(/Purchase price, Area, Address/);
    expect(latest.purchasePrice).toBe(3400000);
    expect(latest.address).toBe("Ellington House 1 - Unit 713");
  });

  it("never overwrites a value the user already typed, and adds a tenancy contract when the property is rented", async () => {
    read.readRealEstateDocument
      .mockResolvedValueOnce({ ok: true, kind: "property", documentType: "dubai_form_f", fileName: "f.pdf", patch: { emirate: "dubai", purchasePrice: 1550000 } })
      .mockResolvedValueOnce({
        ok: true,
        kind: "tenancy",
        emirate: "dubai",
        fileName: "ejari.pdf",
        contract: { tenant_name: "A TENANT", tenancy_start_date: "2026-01-01", tenancy_end_date: "2026-12-31", annual_rent: 90000, tenancy_contract_value: 90000 },
      });
    render(<Harness />);
    choose(pdf("f.pdf"));
    await waitFor(() => expect(latest.purchasePrice).toBe(1550000));
    choose(pdf("ejari.pdf"));
    await waitFor(() => expect(latest.tenancy_contracts).toHaveLength(1));
    expect(latest.tenancy_contracts[0]).toMatchObject({ tenant_name: "A TENANT", annual_rent: 90000, imported_from_file: "ejari.pdf" });
    expect(latest.purchasePrice).toBe(1550000);
  });

  it("shows the reason when a document cannot be read", async () => {
    read.readRealEstateDocument.mockResolvedValueOnce({ ok: false, error: "Could not read this PDF file." });
    render(<Harness />);
    choose(pdf("x.pdf"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read this PDF file.");
  });
});
