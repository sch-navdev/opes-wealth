import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { RETIREMENT_STORAGE_KEY, RetirementSimulator } from "@/components/retirement-simulator";
import { LanguageProvider } from "@/context/language-context";
import { PrivacyProvider } from "@/context/privacy-context";
import type { CategoryAmount } from "@/lib/retirement-assets";

const breakdown: CategoryAmount[] = [
  { category: "Real Estate", amount: 500_000 },
  { category: "Cash", amount: 100_000 },
  { category: "Equities", amount: 100_000 },
  { category: "Vehicles", amount: 30_000 },
];

function renderSim(rows: CategoryAmount[] = breakdown) {
  return render(
    <LanguageProvider>
      <PrivacyProvider>
        <RetirementSimulator baseCurrency="USD" breakdown={rows} />
      </PrivacyProvider>
    </LanguageProvider>,
  );
}

const required = () => screen.getByTestId("ret-required").textContent ?? "";
const field = (name: string) => screen.getByRole("spinbutton", { name: new RegExp(name, "i") });
const slider = (name: string) => screen.getByRole("slider", { name: new RegExp(name, "i") });

async function setField(name: string, value: string) {
  const user = userEvent.setup();
  const input = field(name);
  await user.clear(input);
  await user.type(input, value);
}

async function openAssumptions() {
  await userEvent.setup().click(screen.getByRole("button", { name: /assumptions/i }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("defaults and result", () => {
  it("starts from the liquid and market categories (Real Estate and Vehicles off) and shows the result cards", () => {
    renderSim();
    // 40 -> 65, 3,000/month, 5 %, 2 % inflation, 4 % rule, 200,000 starting assets
    expect(screen.getByTestId("ret-time").textContent).toMatch(/25 years \(300 months\)/);
    expect(screen.getByTestId("ret-income-nominal").textContent).toMatch(/\$4,9\d\d/);
    expect(screen.getByTestId("ret-target")).toBeTruthy();
    expect(screen.getByTestId("ret-assets-grown")).toBeTruthy();
    expect(screen.getByTestId("ret-gap")).toBeTruthy();
    expect(screen.getByTestId("ret-sens")).toBeTruthy();
    expect(screen.getByTestId("ret-summary").textContent).toMatch(/4 % withdrawal rate/);
    expect(required()).toMatch(/^\$[\d,]+$/);
  });

  it("matches the worked example (40 to 60, 5 %, no inflation: about 910 per month)", async () => {
    renderSim();
    await setField("retirement age", "60");
    await openAssumptions();
    await setField("annual inflation", "0");
    expect(required()).toBe("$910");
    expect(screen.getByTestId("ret-target").textContent).toBe("$900,000");
    expect(screen.getByTestId("ret-gap").textContent).toBe("$369,340");
    expect(screen.getByTestId("ret-live").textContent).toMatch(/\$910 per month over 20 years/);
  });

  it("switches to the returns-only method (about 467 per month)", async () => {
    renderSim();
    await setField("retirement age", "60");
    await openAssumptions();
    await setField("annual inflation", "0");
    await userEvent.setup().click(screen.getByRole("radio", { name: /returns only/i }));
    expect(required()).toBe("$467");
    expect(screen.getByTestId("ret-target").textContent).toBe("$720,000");
    expect(screen.getByTestId("ret-summary").textContent).toMatch(/never drawn down/);
    expect(screen.queryByRole("spinbutton", { name: /withdrawal rate/i })).toBeNull();
  });
});

describe("sliders and fields", () => {
  it("a slider updates its numeric field and the result", () => {
    renderSim();
    const before = required();
    fireEvent.change(slider("retirement age"), { target: { value: "70" } });
    expect((field("retirement age") as HTMLInputElement).value).toBe("70");
    expect(screen.getByTestId("ret-time").textContent).toMatch(/30 years/);
    expect(required()).not.toBe(before);
  });

  it("typing in a field moves its slider and exposes aria-valuetext", async () => {
    renderSim();
    await setField("estimated annual return", "6.5");
    expect((slider("estimated annual return") as HTMLInputElement).value).toBe("6.5");
    expect(slider("estimated annual return").getAttribute("aria-valuetext")).toBe("6.5 % a year");
    expect(slider("current age").getAttribute("aria-valuetext")).toBe("40 years");
    expect(slider("desired net passive income").getAttribute("aria-valuetext")).toBe("$3,000 per month");
  });

  it("remembers the inputs in localStorage and restores them on the next render", async () => {
    const first = renderSim();
    await setField("current age", "50");
    expect(JSON.parse(localStorage.getItem(RETIREMENT_STORAGE_KEY) as string).age).toBe("50");
    first.unmount();
    renderSim();
    expect((field("current age") as HTMLInputElement).value).toBe("50");
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem(RETIREMENT_STORAGE_KEY, "{not json");
    renderSim();
    expect((field("current age") as HTMLInputElement).value).toBe("40");
  });
});

describe("validation", () => {
  it("blocks a retirement age that is not after the current age", async () => {
    renderSim();
    await setField("retirement age", "40");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/retirement age must be after the current age/i);
    expect(field("retirement age")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByTestId("ret-required")).toBeNull();
    expect(screen.queryByTestId("ret-live")).toBeNull();
  });

  it("blocks a negative return, an empty income and a returns-only plan at 0 %", async () => {
    renderSim();
    await setField("estimated annual return", "-2");
    expect(screen.getByRole("alert").textContent).toMatch(/between 0 % and 20 %/);
    await setField("estimated annual return", "0");
    expect(screen.queryByRole("alert")).toBeNull(); // the 4 % rule works at 0 %
    expect(required()).toMatch(/^\$/);
    await openAssumptions();
    await userEvent.setup().click(screen.getByRole("radio", { name: /returns only/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/return above 0 %/);
    await setField("estimated annual return", "5");
    await setField("desired net passive income", "0");
    expect(screen.getByRole("alert").textContent).toMatch(/income above zero/i);
  });

  it("allows an inflation of 0 and rejects a negative one", async () => {
    renderSim();
    await openAssumptions();
    await setField("annual inflation", "0");
    expect(screen.queryByRole("alert")).toBeNull();
    await setField("annual inflation", "-1");
    expect(screen.getByRole("alert").textContent).toMatch(/inflation rate between 0 % and 20 %/);
  });
});

describe("on track", () => {
  it("shows the on-track state with the surplus when the assets already cover the target", async () => {
    renderSim();
    await openAssumptions();
    await setField("own figure", "5000000");
    const onTrack = screen.getByTestId("ret-on-track");
    expect(onTrack.textContent).toMatch(/already on track/i);
    expect(onTrack.textContent).toMatch(/No extra saving is needed/);
    expect(required()).toBe("$0");
    expect(screen.getByTestId("ret-live").textContent).toMatch(/on track/i);
    expect(screen.getByTestId("ret-gap").textContent).toBe("$0");
  });
});

describe("assumptions disclosure", () => {
  it("is closed by default and opens with an accessible button", async () => {
    renderSim();
    const trigger = screen.getByRole("button", { name: /assumptions/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("ret-assumptions")).toHaveAttribute("hidden");
    expect(screen.queryByRole("spinbutton", { name: /annual inflation/i })).toBeNull();
    await userEvent.setup().click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByTestId("ret-assumptions");
    expect(panel).not.toHaveAttribute("hidden");
    expect(within(panel).getByRole("spinbutton", { name: /annual inflation/i })).toHaveValue(2);
    expect(within(panel).getByRole("radio", { name: /withdrawal rate/i })).toBeChecked();
    expect(within(panel).getByRole("spinbutton", { name: /withdrawal rate per year/i })).toHaveValue(4);
  });

  it("lets the user switch categories in and out, and override the figure", async () => {
    const user = userEvent.setup();
    renderSim();
    await openAssumptions();
    const cash = screen.getByRole("checkbox", { name: /cash/i });
    const realEstate = screen.getByRole("checkbox", { name: /real estate/i });
    const vehicles = screen.getByRole("checkbox", { name: /vehicles/i });
    expect(cash).toBeChecked();
    expect(realEstate).not.toBeChecked();
    expect(vehicles).not.toBeChecked();
    expect(screen.getByTestId("ret-assets-used").textContent).toMatch(/\$200,000/);

    await user.click(realEstate);
    expect(screen.getByTestId("ret-assets-used").textContent).toMatch(/\$700,000/);
    await user.click(cash);
    expect(screen.getByTestId("ret-assets-used").textContent).toMatch(/\$600,000/);

    await setField("own figure", "123456");
    expect(screen.getByTestId("ret-assets-used").textContent).toMatch(/\$123,456/);
    expect(screen.getByTestId("ret-assets-auto").textContent).toMatch(/\$600,000/);
  });

  it("works with an empty portfolio", () => {
    renderSim([]);
    expect(required()).toMatch(/^\$/);
    expect(screen.getByTestId("ret-assets-grown").textContent).toBe("$0");
  });
});

describe("monthly effort comparison", () => {
  it("shows nothing until a current saving is entered, then the difference", async () => {
    renderSim();
    await setField("retirement age", "60");
    await openAssumptions();
    await setField("annual inflation", "0");
    expect(screen.queryByTestId("ret-effort")).toBeNull();
    await setField("your current monthly saving", "500");
    expect(screen.getByTestId("ret-effort").textContent).toMatch(/\$410 more per month than the saving entered \(\$500\)/);
    await setField("your current monthly saving", "1000");
    expect(screen.getByTestId("ret-effort").textContent).toMatch(/\$90 less per month/);
    await setField("your current monthly saving", "910");
    expect(screen.getByTestId("ret-effort").textContent).toMatch(/Matches the saving entered/);
  });
});

describe("chart and sensitivity", () => {
  it("gives the chart a text alternative and lists every segment", () => {
    renderSim();
    const chart = screen.getByTestId("ret-chart");
    expect(chart).toHaveAttribute("role", "img");
    expect(chart.getAttribute("aria-label")).toMatch(/at retirement,.*comes from current assets/);
    expect(screen.getByTestId("ret-chart-summary").textContent).toBe(chart.getAttribute("aria-label"));
    expect(screen.getByTestId("ret-seg-assets")).toBeTruthy();
  });

  it("lists the return at -1 pt, base, +1 pt and the inflation at 0, 2 and 3 %", () => {
    renderSim();
    const table = screen.getByTestId("ret-sens");
    expect(within(table).getAllByRole("row")).toHaveLength(7); // header + 6
    expect(screen.getByTestId("ret-sens-return-4")).toBeTruthy();
    expect(screen.getByTestId("ret-sens-return-5").textContent).toMatch(/current/);
    expect(screen.getByTestId("ret-sens-return-6")).toBeTruthy();
    expect(screen.getByTestId("ret-sens-inflation-0")).toBeTruthy();
    expect(screen.getByTestId("ret-sens-inflation-2").textContent).toMatch(/current/);
    expect(screen.getByTestId("ret-sens-inflation-3")).toBeTruthy();
  });
});

describe("privacy mode", () => {
  it("masks every money value but keeps percentages and durations", () => {
    localStorage.setItem("opes_privacy_mode", "true");
    renderSim();
    for (const id of ["ret-required", "ret-target", "ret-assets-grown", "ret-gap", "ret-income-nominal"]) {
      expect(screen.getByTestId(id).textContent).not.toMatch(/\$/);
    }
    expect(screen.getByTestId("ret-required").textContent).toBe("••••••••");
    expect(screen.getByTestId("ret-live").textContent).not.toMatch(/\$/);
    expect(screen.getByTestId("ret-chart").getAttribute("aria-label")).not.toMatch(/\$/);
    expect(screen.getByTestId("ret-time").textContent).toMatch(/25 years/);
  });
});

describe("neutral wording", () => {
  it("states the limits and never tells the reader what to do", () => {
    const { container } = renderSim();
    const text = container.textContent ?? "";
    expect(text).toMatch(/not advice and not a forecast/);
    expect(text).toMatch(/Tax on withdrawals is not modelled/);
    expect(text).toMatch(/net \(after-tax\) figure/);
    expect(text).toMatch(/Returns are not guaranteed/);
    expect(text).toMatch(/4 % rule is a rule of thumb/);
    expect(text).toMatch(/Inflation is the largest driver/);
    expect(text).not.toMatch(/\byou should\b|\bwe recommend\b|\bI recommend\b|\byou must\b|\bbuy\b|\bsell\b/i);
    expect(screen.getByTestId("ret-disclaimer")).toBeTruthy();
  });
});

describe("structure", () => {
  it("is a labelled section with a heading and a polite live region", () => {
    renderSim();
    expect(screen.getByRole("region", { name: /retirement passive income/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /retirement passive income/i })).toBeTruthy();
    expect(screen.getByTestId("ret-live")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("ret-live")).toHaveAttribute("role", "status");
  });
});
