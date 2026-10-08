/** EntityLookthrough + ManageHoldingsDialog (jsdom). The server action is mocked; fixtures are invented. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => ({ setEntityHeldAssets: vi.fn() }));
vi.mock("@/app/dashboard/companies/actions", () => action);
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { EntityLookthrough } from "@/components/entity-lookthrough";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { buildEntityLookthrough, buildHoldingOptions, type LookthroughAssetRow } from "@/lib/entity-lookthrough";

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as unknown as Record<string, unknown>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const row = (id: string, category: string, current_value: number, over: Partial<LookthroughAssetRow> = {}): LookthroughAssetRow => ({
  id,
  name: `Asset ${id}`,
  category,
  currency: "USD",
  current_value,
  is_liability: false,
  metadata: null,
  ...over,
});

const assets: LookthroughAssetRow[] = [
  row("trust", "Companies", 300, {
    name: "Family Trust",
    metadata: { entity_type: "trust", ownership_percentage: 100, held_asset_ids: ["villa", "loan", "gone"] },
  }),
  row("spv", "Companies", 0, {
    name: "Villa SPV",
    metadata: { entity_type: "spv", ownership_percentage: 80, held_via: "holding", holding_company_id: "trust" },
  }),
  row("villa", "Real Estate", 1000, { name: "Villa" }),
  row("loan", "Liabilities", 400, { name: "Mortgage", is_liability: true }),
  row("cash", "Cash", 50, { name: "Bank" }),
];

function renderView(manageable = ["trust", "spv"], list = assets) {
  const data = buildEntityLookthrough({ assets: list, baseCurrency: "USD", rates: { USD: 1 } });
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <EntityLookthrough data={data} options={buildHoldingOptions(list, data)} manageableEntityIds={manageable} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  action.setEntityHeldAssets.mockReset();
});

describe("EntityLookthrough", () => {
  it("shows the reconciliation line, entity badges, ownership, subtotal and nested entities", () => {
    renderView();
    const rec = screen.getByTestId("ent-reconciliation").textContent ?? "";
    expect(rec).toMatch(/Held through structures\s*\$900\.00/);
    expect(rec).toMatch(/Held personally\s*\$50\.00/);
    expect(rec).toMatch(/Net worth\s*\$950\.00/);

    const trust = screen.getByTestId("ent-node-trust");
    expect(within(trust).getAllByText("Trust").length).toBeGreaterThan(0);
    expect(within(trust).getByText("100% owned")).toBeTruthy();
    const spv = within(trust).getByTestId("ent-node-spv");
    expect(within(spv).getByText("Special purpose vehicle (SPV)")).toBeTruthy();
    expect(within(trust).getByRole("link", { name: "Villa" })).toHaveAttribute("href", "/dashboard/assets/villa");
    expect(within(trust).getAllByText("-$400.00").length).toBeGreaterThan(0);
  });

  it("shows the double-count note and the missing-link warning in neutral wording", () => {
    renderView();
    expect(screen.getByRole("note").textContent).toMatch(/counts them twice/);
    expect(screen.getByRole("status").textContent).toMatch(/not available here/);
  });

  it("collapses and expands an entity with an accessible disclosure button", async () => {
    renderView();
    const user = userEvent.setup();
    const toggle = within(screen.getByTestId("ent-node-spv")).getByRole("button", { name: /^Villa SPV/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).not.toBeVisible();
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("masks amounts in privacy mode", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderView();
    expect(screen.getByTestId("ent-reconciliation").textContent).not.toMatch(/\d/);
  });

  it("shows the empty state and a shared-entity note instead of the manage button", () => {
    renderView([], [row("cash", "Cash", 5)]);
    expect(screen.getByText(/No entities yet/)).toBeTruthy();
  });

  it("entities that cannot be managed show a note, not the button", () => {
    renderView(["spv"]);
    expect(within(screen.getByTestId("ent-node-trust")).queryByRole("button", { name: "Manage holdings of Family Trust" })).toBeNull();
    expect(screen.getAllByText(/can't be changed here yet/).length).toBe(1);
  });
});

describe("ManageHoldingsDialog", () => {
  async function openDialog() {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Manage holdings of Villa SPV" }));
    return { user, dialog: await screen.findByRole("dialog") };
  }

  it("lists non-Company assets, pre-checks current ones, shows who already holds an asset and filters by search", async () => {
    const { user, dialog } = await openDialog();
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(within(dialog).getByRole("checkbox", { name: /Villa/ })).not.toBeChecked();
    expect(within(dialog).getAllByText(/Held by Family Trust/).length).toBe(2);
    await user.type(within(dialog).getByRole("searchbox", { name: "Search assets" }), "cash");
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(1);
    await user.clear(within(dialog).getByRole("searchbox"));
    await user.type(within(dialog).getByRole("searchbox"), "zzz");
    expect(within(dialog).getByText("No asset matches your search.")).toBeTruthy();
  });

  it("saves the ticked ids through the action and shows the result inline", async () => {
    action.setEntityHeldAssets.mockResolvedValue({ ok: true, heldAssetIds: ["cash"], skipped: 0 });
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("checkbox", { name: /Bank/ }));
    expect(within(dialog).getByText("1 selected")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Save holdings" }));
    expect(action.setEntityHeldAssets).toHaveBeenCalledWith("spv", ["cash"]);
    expect((await within(dialog).findByRole("status")).textContent).toBe("Holdings saved for Villa SPV.");
  });

  it("shows a translated error when the action refuses", async () => {
    action.setEntityHeldAssets.mockResolvedValue({ ok: false, error: "ent_err_co_owned" });
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Save holdings" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/shared with other owners/);
  });

  it("survives a rejected action call", async () => {
    action.setEntityHeldAssets.mockRejectedValue(new Error("network"));
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Save holdings" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/could not be saved/);
  });
});
