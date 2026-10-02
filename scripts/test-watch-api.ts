/**
 * Manual check of the watch valuation waterfall (src/lib/assets/watch-valuation.ts).
 *   npx tsx --env-file=.env.local scripts/test-watch-api.ts
 *   (or: npx ts-node scripts/test-watch-api.ts, if ts-node is installed)
 * With no provider keys set it should end in the "falls back to manual
 * valuation" message below — that is the expected, healthy result.
 */
import { fetchLiveWatchValuation, WatchValuationError } from "../src/lib/assets/watch-valuation";

const watch = { brand: "Rolex", model: "Submariner Date", referenceNumber: "124060" };

async function main() {
  console.log(`Looking up ${watch.brand} ${watch.model} (${watch.referenceNumber})…`);
  try {
    const { price, provider } = await fetchLiveWatchValuation(watch);
    console.log(`OK: ${price} (via ${provider})`);
  } catch (err) {
    if (err instanceof WatchValuationError) {
      console.log(`No live valuation [${err.code}]: ${err.message}`);
      for (const line of err.attempts) console.log(`  - ${line}`);
      console.log("The UI falls back to manual valuation.");
      return;
    }
    throw err;
  }
}

main();
