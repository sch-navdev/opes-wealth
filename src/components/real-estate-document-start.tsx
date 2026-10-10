"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddFormText } from "@/components/add-form-text";
import { readRealEstateDocument } from "@/app/dashboard/real-estate-document-actions";
import type { RealEstateMetadata, TenancyContract } from "@/lib/real-estate";

/** Friendly names for the fields a document can fill (anything else is shown by its key). */
const FIELD_LABELS: Record<string, [string, string]> = {
  purchasePrice: ["af_re_doc_f_price", "Purchase price"],
  contract_price: ["af_re_doc_f_contract_price", "Contract price"],
  surfaceArea: ["af_re_doc_f_area", "Area"],
  internal_area: ["af_re_doc_f_internal_area", "Internal area"],
  terrace_area: ["af_re_doc_f_terrace_area", "Balcony / terrace area"],
  address: ["af_re_doc_f_address", "Address"],
  title_deed_number: ["af_re_doc_f_deed", "Title deed number"],
  oqood_number: ["af_re_doc_f_oqood", "Oqood number"],
  adrec_plot_number: ["af_re_doc_f_plot", "Plot number"],
  adrec_project_id: ["af_re_doc_f_project", "Project number"],
  ownership: ["af_re_doc_f_owners", "Owners"],
  emirate: ["af_re_doc_f_emirate", "Emirate"],
  is_offplan: ["af_re_doc_f_offplan", "Off-plan"],
};

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || v === "" || v === 0 || v === false || (Array.isArray(v) && v.length === 0);

type Read = { name: string; summary: string };

/**
 * The first thing shown when a Real Estate asset is added: upload the title deed / sale contract (and, if
 * the property is rented, the Tawtheeq or Ejari tenancy contract) and the form below is filled from them.
 * Nothing is saved here; the user checks the filled fields and presses Save as usual. Fields already typed
 * are never overwritten, except the emirate (which decides how a tenancy contract is read).
 */
export function RealEstateDocumentStart({
  value,
  onChange,
}: {
  value: RealEstateMetadata;
  onChange: (next: RealEstateMetadata) => void;
}) {
  const tf = useAddFormText();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState<Read[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  // Always merge into the latest form value, even when several files are read one after the other.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  function readFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await readRealEstateDocument(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const current = latest.current;
      if (result.kind === "property") {
        const next = { ...current } as Record<string, unknown>;
        const filled: string[] = [];
        for (const [key, v] of Object.entries(result.patch)) {
          const existing = (current as Record<string, unknown>)[key];
          if (key === "emirate" || isEmpty(existing)) {
            next[key] = v;
            const label = FIELD_LABELS[key];
            if (label && key !== "emirate" && !isEmpty(v)) filled.push(tf(label[0], label[1]));
          }
        }
        onChange(next as unknown as RealEstateMetadata);
        setReads((r) => [...r, { name: result.fileName, summary: filled.join(", ") || tf("af_re_doc_nothing_new", "nothing new") }]);
      } else {
        const c = result.contract;
        const contract: TenancyContract = {
          id: `tenancy-${Date.now().toString(36)}`,
          tenant_name: c.tenant_name ?? "",
          start_date: c.tenancy_start_date ?? "",
          end_date: c.tenancy_end_date ?? "",
          annual_rent: c.annual_rent,
          contract_value: c.tenancy_contract_value,
          imported_from_file: result.fileName,
          uploaded_at: new Date().toISOString().slice(0, 10),
        };
        onChange({ ...current, emirate: current.emirate ?? result.emirate, tenancy_contracts: [...current.tenancy_contracts, contract] });
        setReads((r) => [
          ...r,
          { name: result.fileName, summary: tf("af_re_doc_tenancy_added", "tenancy contract added (rent and dates)") },
        ]);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3" data-testid="re-doc-start">
      <div>
        <p className="text-sm font-medium text-foreground">{tf("af_re_doc_title", "Start from your documents")}</p>
        <p className="text-xs text-muted-foreground">
          {tf(
            "af_re_doc_desc",
            "Upload the title deed or sale contract (PDF) and Opes reads the details, including the purchase price when the document has one. If the property is rented, add the Tawtheeq (Abu Dhabi) or Ejari (Dubai) contract too. You check everything before saving.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => fileInput.current?.click()}>
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
          {tf("af_re_doc_deed_button", "Upload title deed / sale contract")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => fileInput.current?.click()}>
          <FileText className="size-4" aria-hidden="true" />
          {tf("af_re_doc_tenancy_button", "Upload Tawtheeq / Ejari (if rented)")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-label={tf("af_re_doc_deed_button", "Upload title deed / sale contract")}
          data-testid="re-doc-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) readFile(file);
          }}
        />
      </div>
      {reads.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground" role="status">
          {reads.map((r, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{r.name}</span>: {r.summary}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
