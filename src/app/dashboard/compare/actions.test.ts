import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  needsMfaStepUp: vi.fn(),
  isMockAuthEnabled: vi.fn(),
  getMockUserId: vi.fn(),
  createMockAdminClient: vi.fn(),
  getExchangeRatesFromUsd: vi.fn(),
  loadCoOwnedAssets: vi.fn(),
  loadOwnershipFactors: vi.fn(),
  fetchHoldingFx: vi.fn(),
  assetsResult: vi.fn(),
  profileResult: vi.fn(),
  from: vi.fn(),
  eqAssets: vi.fn(),
}));

function client() {
  return { auth: { getUser: mocks.getUser }, from: mocks.from };
}

vi.mock("@/utils/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/utils/supabase/mfa", () => ({ needsMfaStepUp: mocks.needsMfaStepUp }));
vi.mock("@/utils/supabase/mock-auth", () => ({
  isMockAuthEnabled: mocks.isMockAuthEnabled,
  getMockUserId: mocks.getMockUserId,
  createMockAdminClient: mocks.createMockAdminClient,
}));
vi.mock("@/lib/fx", async () => ({
  ...(await vi.importActual<typeof import("@/lib/fx")>("@/lib/fx")),
  getExchangeRatesFromUsd: mocks.getExchangeRatesFromUsd,
}));
vi.mock("@/lib/shared-assets/load", async () => ({
  ...(await vi.importActual<typeof import("@/lib/shared-assets/load")>("@/lib/shared-assets/load")),
  loadCoOwnedAssets: mocks.loadCoOwnedAssets,
  loadOwnershipFactors: mocks.loadOwnershipFactors,
}));
vi.mock("@/lib/irr-holdings-fetch", () => ({ fetchHoldingFx: mocks.fetchHoldingFx }));

import { getComparableHoldings } from "@/app/dashboard/compare/actions";

type Row = Record<string, unknown>;
const car = (over: Row = {}): Row => ({
  id: "car1",
  profile_id: "u1",
  name: "Car",
  category_id: "c",
  quantity: 1,
  current_value: 70000,
  currency: "USD",
  is_liability: false,
  metadata: { purchase_price: 100000 },
  ticker_symbol: null,
  purchase_date: "2022-03-01",
  asset_categories: { name: "Vehicles" },
  ...over,
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  mocks.needsMfaStepUp.mockResolvedValue(false);
  mocks.isMockAuthEnabled.mockReturnValue(false);
  mocks.getExchangeRatesFromUsd.mockResolvedValue({ USD: 1, EUR: 0.9 });
  mocks.loadCoOwnedAssets.mockResolvedValue([]);
  mocks.loadOwnershipFactors.mockImplementation(async (_s: unknown, _u: string, assets: { id: string }[]) => new Map(assets.map((a) => [a.id, 1])));
  mocks.fetchHoldingFx.mockResolvedValue({});
  mocks.assetsResult.mockResolvedValue({ data: [car()], error: null });
  mocks.profileResult.mockResolvedValue({ data: { default_currency: "USD" }, error: null });
  // assets: select().eq(profile).eq(status).order().returns()  |  profiles: select().eq().single()
  mocks.eqAssets.mockImplementation(() => ({ eq: () => ({ order: () => ({ returns: mocks.assetsResult }) }) }));
  mocks.from.mockImplementation((table: string) => ({
    select: () =>
      table === "assets" ? { eq: mocks.eqAssets } : { eq: () => ({ single: mocks.profileResult }) },
  }));
});

describe("getComparableHoldings", () => {
  it("requires a signed-in user and never touches the database without one", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await getComparableHoldings()).toEqual({ ok: false, error: "You must be signed in." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("blocks a session that still needs the MFA step-up", async () => {
    mocks.needsMfaStepUp.mockResolvedValue(true);
    const r = await getComparableHoldings();
    expect(r).toEqual({ ok: false, error: "Two-factor verification required." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("builds the holdings of the session user, in the profile's currency, as plain JSON", async () => {
    mocks.assetsResult.mockResolvedValue({
      data: [car(), car({ id: "cash1", name: "Bank", asset_categories: { name: "Cash" } })],
      error: null,
    });
    const r = await getComparableHoldings();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.baseCurrency).toBe("USD");
    expect(r.holdings).toHaveLength(2);
    expect(r.holdings[0]).toMatchObject({ id: "car1", category: "Vehicles", currency: "USD" });
    expect(r.holdings[0].flows?.[0]).toEqual({ date: "2022-03-01", amount: -100000 });
    expect(r.holdings[0].flows?.at(-1)?.amount).toBe(70000);
    expect(r.holdings[1]).toMatchObject({ id: "cash1", unavailable: "unsupported_category" });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    // the query is scoped to the session user, never to caller input
    expect(mocks.eqAssets).toHaveBeenCalledWith("profile_id", "u1");
    // no foreign flows: no network
    expect(mocks.fetchHoldingFx).not.toHaveBeenCalled();
  });

  it("applies the co-ownership share (shared assets included, values reduced)", async () => {
    mocks.assetsResult.mockResolvedValue({ data: [], error: null });
    mocks.loadCoOwnedAssets.mockResolvedValue([car({ id: "shared1", profile_id: "other" })]);
    mocks.loadOwnershipFactors.mockResolvedValue(new Map([["shared1", 0.5]]));
    const r = await getComparableHoldings();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.holdings).toHaveLength(1);
    // current_value scaled by the share (70000 -> 35000), purchase price scaled in the metadata (100000 -> 50000)
    expect(r.holdings[0].flows?.[0].amount).toBe(-50000);
    expect(r.holdings[0].flows?.at(-1)?.amount).toBe(35000);
  });

  it("fetches historical FX for foreign flows and uses it", async () => {
    mocks.assetsResult.mockResolvedValue({ data: [car({ currency: "EUR" })], error: null });
    mocks.fetchHoldingFx.mockResolvedValue({ EUR: { "2022-03-01": 1.1 } });
    const r = await getComparableHoldings();
    expect(mocks.fetchHoldingFx).toHaveBeenCalledWith({ EUR: ["2022-03-01"] }, "USD");
    expect(r.ok && r.holdings[0].flows?.[0].amount).toBeCloseTo(-110000, 6);
  });

  it("degrades to missing_fx when the provider returned nothing", async () => {
    mocks.assetsResult.mockResolvedValue({ data: [car({ currency: "EUR" })], error: null });
    mocks.fetchHoldingFx.mockResolvedValue({});
    const r = await getComparableHoldings();
    expect(r.ok && r.holdings[0]).toMatchObject({ unavailable: "missing_fx" });
  });

  it("uses the profile's default currency, falling back to USD", async () => {
    mocks.profileResult.mockResolvedValue({ data: { default_currency: "EUR" }, error: null });
    const eur = await getComparableHoldings();
    expect(eur.ok && eur.baseCurrency).toBe("EUR");
    mocks.profileResult.mockResolvedValue({ data: null, error: { message: "x" } });
    const fallback = await getComparableHoldings();
    expect(fallback.ok && fallback.baseCurrency).toBe("USD");
  });

  it("mock-auth dev mode uses the mock admin client and skips the MFA check", async () => {
    mocks.isMockAuthEnabled.mockReturnValue(true);
    mocks.getMockUserId.mockReturnValue("dev-user");
    mocks.createMockAdminClient.mockReturnValue(client());
    mocks.needsMfaStepUp.mockResolvedValue(true);
    const r = await getComparableHoldings();
    expect(r.ok).toBe(true);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.needsMfaStepUp).not.toHaveBeenCalled();
    expect(mocks.eqAssets).toHaveBeenCalledWith("profile_id", "dev-user");
  });

  it("returns an error (not a throw) when loading fails", async () => {
    mocks.assetsResult.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getComparableHoldings()).toEqual({ ok: false, error: "Could not load your assets." });
    mocks.assetsResult.mockRejectedValue(new Error("network"));
    expect(await getComparableHoldings()).toEqual({ ok: false, error: "Could not load your holdings." });
  });
});
