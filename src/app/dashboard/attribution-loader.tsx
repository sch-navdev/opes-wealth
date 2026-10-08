import { Suspense } from "react";
import { ExpertAttributionBlock } from "@/components/dashboard-expert-panels";
import { Card, CardContent } from "@/components/ui/card";
import { buildAttributionPanelData, type AttributionCandidate } from "@/lib/dashboard-attribution";
import { fetchAttributionFx } from "@/lib/dashboard-attribution-fetch";

type Props = {
  candidates: AttributionCandidate[];
  baseCurrency: string;
  rates: Record<string, number>;
};

/**
 * Server component: waits for the historical-FX fetch (up to its 6 s budget) on its own,
 * so the rest of the dashboard streams to the browser without waiting for it.
 */
async function AttributionLoaded({ candidates, baseCurrency, rates }: Props) {
  const data = buildAttributionPanelData({
    candidates,
    baseCurrency,
    rates,
    fxHistory: await fetchAttributionFx(candidates, baseCurrency),
  });
  return data ? <ExpertAttributionBlock attribution={data} baseCurrency={baseCurrency} /> : null;
}

function AttributionSkeleton() {
  return (
    <Card className="h-full" aria-hidden="true" data-testid="attribution-skeleton">
      <CardContent className="space-y-3 pt-6">
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-8 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-3 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </CardContent>
    </Card>
  );
}

/** The Expert "currency vs capital" tile, streamed. Callers skip it when there are no candidates. */
export function StreamedAttribution(props: Props) {
  return (
    <Suspense fallback={<AttributionSkeleton />}>
      <AttributionLoaded {...props} />
    </Suspense>
  );
}
