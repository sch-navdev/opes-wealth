"use server";

import { runOcrSelfTest, type OcrSelfTestResult } from "@/lib/services/ocr-selftest";
import { createClient } from "@/utils/supabase/server";

export type OcrSelfTestActionResult = OcrSelfTestResult | { unauthenticated: true };

/** Signed-in users only (createClient also serves the dev mock session). Returns non-secret facts only. */
export async function testOcrConnection(): Promise<OcrSelfTestActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { unauthenticated: true };
  return runOcrSelfTest();
}
