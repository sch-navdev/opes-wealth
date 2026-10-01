/**
 * Read-only on-chain balance lookup for the Crypto module's "wallet address
 * sync". Only a PUBLIC address is ever needed — never a seed phrase or private
 * key, and the UI says so. Server-side use only (imported by server actions).
 *
 * Providers (all free, keyless public endpoints):
 *   - Bitcoin  → mempool.space  (`/api/address/:addr`, confirmed balance)
 *   - Ethereum → Blockscout     (`/api/v2/addresses/:addr`, native ETH only —
 *                ERC-20 tokens are NOT included; add those as their own asset)
 *   - Solana   → public mainnet RPC (`getBalance`, native SOL only)
 *
 * Public endpoints can rate-limit; failures are returned, never thrown, and the
 * caller keeps the asset's previous quantity.
 */
export type WalletChain = "bitcoin" | "ethereum" | "solana";

export const WALLET_CHAINS: WalletChain[] = ["bitcoin", "ethereum", "solana"];

/** CoinGecko id + ticker that price each chain's native coin. */
export const WALLET_CHAIN_COIN: Record<WalletChain, { coingeckoId: string; ticker: string }> = {
  bitcoin: { coingeckoId: "bitcoin", ticker: "BTC" },
  ethereum: { coingeckoId: "ethereum", ticker: "ETH" },
  solana: { coingeckoId: "solana", ticker: "SOL" },
};

const ADDRESS_PATTERNS: Record<WalletChain, RegExp> = {
  bitcoin: /^(bc1[a-z0-9]{20,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/,
  ethereum: /^0x[a-fA-F0-9]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

export function isValidWalletAddress(chain: WalletChain, address: string): boolean {
  return ADDRESS_PATTERNS[chain].test(address.trim());
}

export type WalletBalanceResult =
  | { ok: true; balance: number }
  | { ok: false; code: "invalid_address" | "rate_limited" | "network_error"; error: string };

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
    const body = response.ok ? await response.json() : null;
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Native-coin balance in whole coins (BTC / ETH / SOL), or why it couldn't be read. */
export async function fetchWalletBalance(
  chain: WalletChain,
  rawAddress: string,
): Promise<WalletBalanceResult> {
  const address = rawAddress.trim();
  if (!isValidWalletAddress(chain, address)) {
    return { ok: false, code: "invalid_address", error: "That doesn't look like a valid address." };
  }

  try {
    if (chain === "bitcoin") {
      const { status, body } = await fetchJson(
        `https://mempool.space/api/address/${encodeURIComponent(address)}`,
      );
      if (status === 429) return rateLimited();
      const stats = (body as { chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number } })
        ?.chain_stats;
      if (!stats) return networkError(`mempool.space returned ${status}.`);
      return { ok: true, balance: ((stats.funded_txo_sum ?? 0) - (stats.spent_txo_sum ?? 0)) / 1e8 };
    }

    if (chain === "ethereum") {
      const { status, body } = await fetchJson(
        `https://eth.blockscout.com/api/v2/addresses/${address}`,
      );
      if (status === 429) return rateLimited();
      if (status === 404) return { ok: true, balance: 0 }; // never-used address
      const wei = (body as { coin_balance?: string | null } | null)?.coin_balance;
      if (wei == null) return networkError(`Blockscout returned ${status}.`);
      // Wei can exceed 2^53: split before converting to a float.
      return { ok: true, balance: Number(BigInt(wei) / BigInt("1000000000000")) / 1e6 };
    }

    const { status, body } = await fetchJson("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
    });
    if (status === 429) return rateLimited();
    const lamports = (body as { result?: { value?: number } } | null)?.result?.value;
    if (typeof lamports !== "number") return networkError(`Solana RPC returned ${status}.`);
    return { ok: true, balance: lamports / 1e9 };
  } catch (e) {
    return networkError(e instanceof Error ? e.message : "Couldn't reach the blockchain provider.");
  }
}

function rateLimited(): WalletBalanceResult {
  return { ok: false, code: "rate_limited", error: "The blockchain provider's rate limit was hit." };
}

function networkError(error: string): WalletBalanceResult {
  return { ok: false, code: "network_error", error };
}
