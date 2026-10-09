/** EntityLookthroughViews (jsdom). React Flow cannot render in jsdom: next/dynamic is mocked. Invented fixtures. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loader: vi.fn(), canvasProps: vi.fn() }));
vi.mock("@/app/dashboard/companies/actions", () => ({ setEntityHeldAssets: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The mock never calls the loader (the real chunk is not fetched) and renders the loading placeholder only.
vi.mock("next/dynamic", () => ({
  default: (loader: () => unknown, options: { ssr?: boolean; loading?: () => React.ReactNode }) => {
    mocks.loader.mockImplementation(loader);
    return function Lazy(props: unknown) {
      mocks.canvasProps(props);
      return <>{options.loading?.()}</>;
    };
  },
}));

import { EntityLookthroughViews } from "@/components/entity-map-switcher";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import { buildEntityLookthrough, buildHoldingOptions, type LookthroughAssetRow } from "@/lib/entity-lookthrough";

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
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
const assets = [
  row("trust", "Companies", 300, { name: "Family Trust", metadata: { entity_type: "trust", held_asset_ids: ["villa"] } }),
  row("villa", "Real Estate", 1000, { name: "Villa" }),
  row("cash", "Cash", 50),
];

function renderViews(list = assets) {
  const data = buildEntityLookthrough({ assets: list, baseCurrency: "USD", rates: { USD: 1 } });
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <EntityLookthroughViews data={data} options={buildHoldingOptions(list, data)} manageableEntityIds={["trust"]} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  mocks.canvasProps.mockClear();
  localStorage.clear();
});

describe("EntityLookthroughViews", () => {
  it("shows the accessible tree by default and no map", () => {
    renderViews();
    expect(screen.getByTestId("ent-reconciliation")).toBeInTheDocument();
    expect(screen.getByTestId("ent-node-trust")).toBeInTheDocument();
    expect(screen.queryByTestId("entity-map-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("entity-map-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("ent-view-tree")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ent-view-map")).toHaveAttribute("aria-pressed", "false");
    expect(mocks.canvasProps).not.toHaveBeenCalled();
  });

  it("switching to Map shows the lazy placeholder, hands the canvas the derived map, and back restores the tree", async () => {
    const user = userEvent.setup();
    renderViews();
    await user.click(screen.getByTestId("ent-view-map"));
    expect(screen.getByTestId("ent-view-map")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("entity-map-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("ent-node-trust")).not.toBeInTheDocument();
    expect(screen.getByTestId("ent-map-reconciliation")).toHaveTextContent("$1,350.00");
    const props = mocks.canvasProps.mock.calls.at(-1)![0] as {
      map: { nodes: unknown[]; summary: { entities: number } };
      baseCurrency: string;
    };
    expect(props.baseCurrency).toBe("USD");
    expect(props.map.summary.entities).toBe(1);
    expect(props.map.nodes).toHaveLength(4); // owner, trust, villa, personal

    await user.click(screen.getByTestId("ent-view-tree"));
    expect(screen.getByTestId("ent-node-trust")).toBeInTheDocument();
    expect(screen.queryByTestId("entity-map-skeleton")).not.toBeInTheDocument();
  });

  it("masks amounts in the map view's reconciliation line in privacy mode", async () => {
    localStorage.setItem("opes_privacy_mode", "true");
    const user = userEvent.setup();
    renderViews();
    await user.click(screen.getByTestId("ent-view-map"));
    expect(screen.getByTestId("ent-map-reconciliation")).not.toHaveTextContent("1,350");
  });

  it("does not render a canvas when there are no entities", async () => {
    const user = userEvent.setup();
    renderViews([row("cash", "Cash", 10)]);
    await user.click(screen.getByTestId("ent-view-map"));
    expect(screen.queryByTestId("entity-map-skeleton")).not.toBeInTheDocument();
    expect(mocks.canvasProps).not.toHaveBeenCalled();
  });
});
