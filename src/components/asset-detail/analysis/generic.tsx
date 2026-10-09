"use client";

import { MinTier } from "./ui";
import { PositionStats, ValueHistoryCard } from "./common-cards";
import { AnalysisCard, AnalysisStack, StatGrid } from "./ui";
import { useAnalysisText } from "./text";
import type { AssetAnalysisProps } from "./types";

/** Fallback for any category without its own view (e.g. a category added later): value history and share of portfolio. */
export function GenericAnalysis(p: AssetAnalysisProps) {
  const at = useAnalysisText();
  return (
    <AnalysisStack testId="analysis-generic">
      <ValueHistoryCard p={p} />
      <MinTier min="professional">
        <AnalysisCard title={at("an_position")} testId="an-generic-position">
          <StatGrid className="sm:grid-cols-2 lg:grid-cols-2">
            <PositionStats p={p} />
          </StatGrid>
        </AnalysisCard>
      </MinTier>
    </AnalysisStack>
  );
}
