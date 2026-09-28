import { createClient } from "@/utils/supabase/client";

export type DariValuationRequest = {
  assetId: string;
  address?: string | null;
  propertyType?: string | null;
  surfaceArea?: number | null;
};

export type DariValuationResult =
  | { ok: true; value: number; asOf: string; isMock: boolean }
  | { ok: false; error: string };

/**
 * Calls the `refresh-dari-valuation` Edge Function for one property.
 *
 * STUBBED end-to-end: the Edge Function returns a clearly-marked mock
 * figure (`isMock: true`) rather than a real ADREC/DARI valuation, since
 * that provider has no confirmed public API yet (see
 * `tracker/Market-Data-Integration.md`). The request/response contract
 * here is the real, final shape -- only the Edge Function's internal
 * `fetchFromProvider` needs to change once real API access exists.
 */
export async function fetchDariValuation(
  request: DariValuationRequest,
): Promise<DariValuationResult> {
  const supabase = createClient();

  const { data, error } = await supabase.functions.invoke("refresh-dari-valuation", {
    body: request,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (data?.error) {
    return {
      ok: false,
      error: data.error.message ?? "The valuation request failed.",
    };
  }

  if (typeof data?.value !== "number" || !data?.asOf) {
    return {
      ok: false,
      error: "Received an unexpected response from the valuation provider.",
    };
  }

  return {
    ok: true,
    value: data.value,
    asOf: data.asOf,
    isMock: !!data.isMock,
  };
}
