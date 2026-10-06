import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import { OwnerShareNote } from "@/components/owner-share-note";

const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe("OwnerShareNote", () => {
  it("shows the share and that edits apply to the whole asset at 50%", () => {
    wrap(<OwnerShareNote factor={0.5} />);
    expect(screen.getByTestId("owner-share-note")).toHaveTextContent(
      "Showing your 50% share. Edits apply to the whole asset.",
    );
  });

  it("renders nothing for a sole owner", () => {
    wrap(<OwnerShareNote factor={1} />);
    expect(screen.queryByTestId("owner-share-note")).toBeNull();
  });

  it("edit variant tells the user the form values are for the whole asset", () => {
    wrap(<OwnerShareNote factor={0.25} variant="edit" />);
    expect(screen.getByTestId("owner-share-note")).toHaveTextContent(
      "Values below are for the whole asset, not just your share.",
    );
  });
});
