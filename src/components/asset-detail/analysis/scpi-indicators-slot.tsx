"use client";

import { useMemo } from "react";
import { ScpiIndicatorsPanel } from "@/components/asset-detail/scpi-overview-card";
import { useScpiText } from "@/components/scpi-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { moneyFormatter } from "@/lib/money-parts";
import { parseScpiMetadata } from "@/lib/scpi";
import { AnalysisCard } from "./ui";
import type { AssetAnalysisProps } from "./types";

/**
 * The SCPI indicators card at the top of the SCPI analysis: the latest VDRec / VDRea with their date,
 * the ratios against the current subscription and withdrawal prices (neutral reading), sale minus
 * purchase, revalorisations and the distribution summary. Same panel as the Overview card.
 */
export function ScpiIndicatorsSlot({ p }: { p: AssetAnalysisProps }) {
  const st = useScpiText();
  const { intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const metadata = useMemo(() => parseScpiMetadata(p.asset.metadata), [p.asset.metadata]);
  const formatter = useMemo(() => moneyFormatter(intlLocale, p.asset.currency), [intlLocale, p.asset.currency]);
  return (
    <AnalysisCard title={st("scpi2_card_title")} testId="an-scpi-indicators">
      <ScpiIndicatorsPanel
        metadata={metadata}
        shares={p.asset.quantity}
        today={p.today}
        maskValue={maskValue}
        currencyFormatter={formatter}
      />
    </AnalysisCard>
  );
}
