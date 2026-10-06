import { describe, expect, it } from "vitest";
import {
  EMPTY_CRYPTO_METADATA,
  getCryptoMetadataErrors,
  parseCryptoMetadata,
  type CryptoMetadata,
} from "./crypto";

const ETH = "0x" + "a".repeat(40);
const BTC_BECH32 = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const BTC_LEGACY = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const SOL = "11111111111111111111111111111111";

const meta = (over: Partial<CryptoMetadata> = {}): CryptoMetadata => ({
  ...EMPTY_CRYPTO_METADATA,
  coingecko_id: "bitcoin",
  ...over,
});

describe("parseCryptoMetadata", () => {
  it("returns the empty defaults for null, undefined or non-objects", () => {
    expect(parseCryptoMetadata(null)).toEqual(EMPTY_CRYPTO_METADATA);
    expect(parseCryptoMetadata(undefined)).toEqual(EMPTY_CRYPTO_METADATA);
    expect(parseCryptoMetadata("x")).toEqual(EMPTY_CRYPTO_METADATA);
    expect(parseCryptoMetadata(5)).toEqual(EMPTY_CRYPTO_METADATA);
  });

  it("fills missing fields from the defaults (pre-OW7 rows are manual holdings)", () => {
    const out = parseCryptoMetadata({ coingecko_id: "ethereum", last_unit_price: 3000 });
    expect(out.coingecko_id).toBe("ethereum");
    expect(out.last_unit_price).toBe(3000);
    expect(out.holding_source).toBe("manual");
    expect(out.wallet_address).toBe("");
  });

  it("does not mutate the shared defaults", () => {
    const out = parseCryptoMetadata({ coingecko_id: "x" });
    expect(out).not.toBe(EMPTY_CRYPTO_METADATA);
    expect(EMPTY_CRYPTO_METADATA.coingecko_id).toBe("");
  });
});

describe("getCryptoMetadataErrors", () => {
  it("requires a coingecko id (whitespace does not count)", () => {
    expect(getCryptoMetadataErrors(EMPTY_CRYPTO_METADATA)).toEqual(["crypto_coingecko_id_required"]);
    expect(getCryptoMetadataErrors(meta({ coingecko_id: "   " }))).toEqual(["crypto_coingecko_id_required"]);
  });

  it("accepts a manual holding with just an id", () => {
    expect(getCryptoMetadataErrors(meta())).toEqual([]);
  });

  it("requires a chain for wallet holdings", () => {
    expect(getCryptoMetadataErrors(meta({ holding_source: "wallet" }))).toEqual(["crypto_wallet_chain_required"]);
  });

  it("validates the address for the chosen chain", () => {
    expect(getCryptoMetadataErrors(meta({ holding_source: "wallet", wallet_chain: "ethereum", wallet_address: ETH }))).toEqual([]);
    expect(getCryptoMetadataErrors(meta({ holding_source: "wallet", wallet_chain: "bitcoin", wallet_address: BTC_BECH32 }))).toEqual([]);
    expect(getCryptoMetadataErrors(meta({ holding_source: "wallet", wallet_chain: "bitcoin", wallet_address: BTC_LEGACY }))).toEqual([]);
    expect(getCryptoMetadataErrors(meta({ holding_source: "wallet", wallet_chain: "solana", wallet_address: SOL }))).toEqual([]);
    expect(getCryptoMetadataErrors(meta({ holding_source: "wallet", wallet_chain: "ethereum", wallet_address: "0x123" }))).toEqual([
      "crypto_wallet_address_invalid",
    ]);
    expect(getCryptoMetadataErrors(meta({ holding_source: "wallet", wallet_chain: "solana", wallet_address: ETH }))).toEqual([
      "crypto_wallet_address_invalid",
    ]);
  });

  it("tolerates surrounding whitespace in the address", () => {
    expect(
      getCryptoMetadataErrors(meta({ holding_source: "wallet", wallet_chain: "ethereum", wallet_address: `  ${ETH} ` })),
    ).toEqual([]);
  });

  it("collects every error, not just the first", () => {
    expect(getCryptoMetadataErrors({ ...EMPTY_CRYPTO_METADATA, holding_source: "wallet" })).toEqual([
      "crypto_coingecko_id_required",
      "crypto_wallet_chain_required",
    ]);
  });

  it("ignores wallet fields for manual holdings", () => {
    expect(getCryptoMetadataErrors(meta({ wallet_chain: "ethereum", wallet_address: "junk" }))).toEqual([]);
  });
});
