import { describe, expect, it } from "vitest";
import { NEW, NONE, initialGroupState } from "@/lib/banking/batch-import";
import { bankGroupName } from "@/lib/banking/account-country";
import { skipKey } from "@/lib/banking/skipped-accounts";

const fab = { accountRef: "AE920351001383909817031", currency: "AED", rows: [] };

describe("initialGroupState (which account a statement group goes to)", () => {
  it("never pre-selects another bank's only AED account (a FAB statement is not CBD)", () => {
    const cbd = { id: "cbd1", name: "CBD AED", currency: "AED", bankProfile: "cbd", accountRef: "0009874990" };
    expect(initialGroupState(fab, "fab", [cbd])).toMatchObject({ target: NEW });
  });

  it("still pre-selects an unrelated-by-profile account when it could be this one (no bank, no number)", () => {
    const manual = { id: "m1", name: "Savings", currency: "AED" };
    expect(initialGroupState(fab, "fab", [manual])).toMatchObject({ target: "m1", autoPicked: true });
  });

  it("does not pre-select an account that carries a different account number", () => {
    const other = { id: "o1", name: "FAB other", currency: "AED", bankProfile: "fab", accountRef: "AE000000000000007013" };
    expect(initialGroupState(fab, "fab", [other]).target).toBe(NEW);
  });

  it("routes by account number first", () => {
    const same = { id: "f1", name: "FAB 7031", currency: "AED", bankProfile: "fab", accountRef: "AE920351001383909817031" };
    expect(initialGroupState(fab, "fab", [same]).target).toBe("f1");
  });

  it("leaves a group out when the user chose never to import that account", () => {
    const key = skipKey("fab", fab);
    expect(key).toBe("fab|7031|AED");
    const st = initialGroupState(fab, "fab", [], new Set([key as string]));
    expect(st).toMatchObject({ target: NONE, skippedByPreference: true });
  });

  it("has no key (so no remembered skip) for a statement without an account number", () => {
    expect(skipKey("fab", { accountRef: "", currency: "AED" })).toBeNull();
  });
});

describe("bankGroupName", () => {
  it("lists a bank's card layouts under the bank", () => {
    expect(bankGroupName("First Abu Dhabi Bank credit card")).toBe("First Abu Dhabi Bank");
    expect(bankGroupName("Banque Populaire card")).toBe("Banque Populaire");
    expect(bankGroupName("HSBC UAE credit card")).toBe("HSBC UAE");
    expect(bankGroupName("Wio Bank")).toBe("Wio Bank");
  });
});
