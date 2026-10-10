"use server";

import { pdfToText } from "@/lib/pdf-text";
import { createClient } from "@/utils/supabase/server";
import {
  hasAnyExtractedField as hasAnyPropertyDocumentField,
  parsePropertyDocument,
  toRealEstateMetadataPatch,
  type PropertyDocumentType,
} from "@/lib/property-document-parser";
import { hasAnyExtractedField as hasAnyTenancyField, parseTenancyContract, type ParsedTenancyContract } from "@/lib/tenancy-parser";
import type { RealEstateMetadata } from "@/lib/real-estate";

/** 5 MB: the same cap as the server-action body limit for statements. */
const MAX_BYTES = 5 * 1024 * 1024;

export type ReadRealEstateDocumentResult =
  | { ok: true; kind: "property"; documentType: PropertyDocumentType; patch: Partial<RealEstateMetadata>; fileName: string }
  | { ok: true; kind: "tenancy"; contract: ParsedTenancyContract; emirate: "dubai" | "abu_dhabi"; fileName: string }
  | { ok: false; error: string };

/**
 * Reads one uploaded PDF while a Real Estate asset is being ADDED (no asset exists yet, nothing is
 * stored): a title deed / sale contract / Form F / Oqood / DLD receipt (`parsePropertyDocument`), or a
 * tenancy contract (Ejari for Dubai, Tawtheeq for Abu Dhabi). The Add Asset form copies the result into
 * its own fields for the user to check; only the form's Save writes anything. The same parsers as the
 * asset page's document import, so the same verification caveats apply (formats seen only; a scanned
 * deed has no text layer and reads as nothing).
 */
export async function readRealEstateDocument(formData: FormData): Promise<ReadRealEstateDocumentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to read a document." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file was uploaded." };
  if (!file.name.toLowerCase().endsWith(".pdf")) return { ok: false, error: "Upload a PDF file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "This PDF is larger than 5 MB." };

  let text: string;
  try {
    text = await pdfToText(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Could not read this PDF file." };
  }

  const property = parsePropertyDocument(text);
  if (property && hasAnyPropertyDocumentField(property)) {
    return { ok: true, kind: "property", documentType: property.type, patch: toRealEstateMetadataPatch(property), fileName: file.name };
  }

  // Tawtheeq (Abu Dhabi) and Ejari (Dubai) name themselves in the text; otherwise take whichever one reads something.
  const emirates: ("abu_dhabi" | "dubai")[] = /tawtheeq/i.test(text) ? ["abu_dhabi", "dubai"] : ["dubai", "abu_dhabi"];
  for (const emirate of emirates) {
    const contract = parseTenancyContract(text, emirate);
    if (hasAnyTenancyField(contract)) return { ok: true, kind: "tenancy", contract, emirate, fileName: file.name };
  }

  return {
    ok: false,
    error: "This doesn't look like a supported title deed, sale contract or tenancy contract, or no details could be read from it (a scanned PDF has no text to read).",
  };
}
