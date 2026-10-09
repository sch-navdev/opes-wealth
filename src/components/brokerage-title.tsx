"use client";

import { useBankingText } from "@/components/banking-text";

/** Heading of the Brokerage page (client side so it follows the UI language, with the English fallback). */
export function BrokerageTitle() {
  const tx = useBankingText();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tx("brokerage_page_title")}</h1>
      <p className="text-sm text-muted-foreground">{tx("brokerage_page_subtitle")}</p>
    </div>
  );
}
