/**
 * Co-owner APPROVAL flow, UI level (jsdom).
 *
 * HONEST LIMIT: a mocked simulation, not two real accounts. The REAL `ApprovalsBell`
 * and `OwnershipStatusPanel` render inside the real `LanguageProvider` (English). The
 * server-action module is mocked (`vi.mock`) with a tiny in-memory "server" holding one
 * pending request from A to B; "who is signed in" is simply which user's data the
 * harness feeds the components, exactly as the dashboard layout does with
 * `loadPendingApprovals(user.id)`. The real server logic is covered separately in
 * src/lib/shared-assets/approval-flow.test.ts.
 *
 * The bell is a pure view of its `items` prop; in the app the item disappears because the
 * action calls `revalidatePath` and the layout re-renders with fresh data. The harness
 * emulates that by re-rendering from the fake server's state after each action.
 */
import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/context/language-context";
import type { OwnershipStatus, PendingApproval } from "@/lib/shared-assets/server";

const A = "user-a";
const B = "user-b";

type FakeServer = {
  status: "pending" | "approved" | "rejected";
  refresh: () => void;
  respond: (userId: string, requestId: string, approve: boolean) => { ok: true; outcome: "approved" | "rejected" } | { ok: false; error: string };
};

const s = vi.hoisted(() => ({
  me: "" as string,
  calls: [] as [string, boolean][],
  override: null as null | { ok: false; error: string },
  server: null as unknown as FakeServer,
}));

vi.mock("@/app/dashboard/ownership-actions", () => ({
  respondToChangeRequest: vi.fn(async (requestId: string, approve: boolean) => {
    s.calls.push([requestId, approve]);
    const res = s.override ?? s.server.respond(s.me, requestId, approve);
    if (res.ok) s.server.refresh(); // = revalidatePath: the layout re-renders with fresh data
    return res;
  }),
  resendApprovalEmail: vi.fn(async () => ({ ok: true as const })),
  resendCoOwnerInvite: vi.fn(async () => ({ ok: true as const })),
  revokePendingCoOwner: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => s.server.refresh() }) }));

import { ApprovalsBell } from "@/components/approvals-bell";
import { OwnershipStatusPanel } from "@/components/ownership-status";

const REQUEST_ID = "req-1";
const pendingForB: PendingApproval = {
  requestId: REQUEST_ID,
  assetId: "asset-1",
  assetName: "Marina flat",
  requesterName: "Alice Adams",
  createdAt: "2026-10-01T00:00:00Z",
  expiresAt: "2099-10-08T00:00:00Z",
  changes: [{ key: "current_value", before: "1000000 USD", after: "1200000 USD" }],
};

/** What `loadPendingApprovals(userId)` would return: only the approver has an item. */
const itemsFor = (userId: string): PendingApproval[] => (userId === B && s.server.status === "pending" ? [pendingForB] : []);

function Harness({ userId }: { userId: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    s.server.refresh = () => force((n) => n + 1);
  }, []);
  return (
    <LanguageProvider>
      <ApprovalsBell items={itemsFor(userId)} />
    </LanguageProvider>
  );
}

function statusFor(userId: string, approval: "pending" | "approved" | "rejected"): OwnershipStatus {
  return {
    isCreator: userId === A,
    owners: [
      { key: "owner-0", name: "Alice Adams", email: "a@x.com", percentage: 50, isCreator: true, isYou: userId === A, joined: true, inviteStatus: "not_sent", invitedAt: null, inviteError: null },
      { key: "owner-1", name: "Bob Brown", email: "b@x.com", percentage: 50, isCreator: false, isYou: userId === B, joined: true, inviteStatus: "not_sent", invitedAt: null, inviteError: null },
    ],
    request: {
      id: REQUEST_ID,
      requesterName: "Alice Adams",
      isMine: userId === A,
      createdAt: "2026-10-01T00:00:00Z",
      expiresAt: "2099-10-08T00:00:00Z",
      timeLeft: { unit: "days", n: 6 },
      approvals: [
        { profileId: B, name: "Bob Brown", email: "b@x.com", status: approval, decidedAt: null, notifyStatus: "sent", notifiedAt: "2026-10-01T00:00:00Z", notifyError: null },
      ],
    },
  };
}

beforeEach(() => {
  s.me = "";
  s.calls = [];
  s.override = null;
  s.server = {
    status: "pending",
    refresh: () => {},
    respond(userId, requestId, approve) {
      if (userId !== B || requestId !== REQUEST_ID || this.status !== "pending") return { ok: false, error: "No pending approval for you on this request." };
      this.status = approve ? "approved" : "rejected";
      return { ok: true, outcome: this.status };
    },
  };
});

describe("approvals bell as co-owner B (the approver)", () => {
  it("shows A's pending request with its changes and a badge count", async () => {
    s.me = B;
    const user = userEvent.setup();
    render(<Harness userId={B} />);

    const trigger = screen.getByRole("button", { name: "Approvals" });
    expect(within(trigger).getByText("1")).toBeInTheDocument();
    await user.click(trigger);

    expect(screen.getByText(/Alice Adams wants to change/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Marina flat" })).toHaveAttribute("href", "/dashboard/assets/asset-1");
    expect(screen.getByText(/1000000 USD → 1200000 USD/)).toBeInTheDocument();
    expect(screen.getByText(/Applied automatically on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("Accept calls the action with the right request id, and the item disappears", async () => {
    s.me = B;
    const user = userEvent.setup();
    render(<Harness userId={B} />);
    await user.click(screen.getByRole("button", { name: "Approvals" }));
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(screen.getByText("Nothing waiting for your approval.")).toBeInTheDocument());
    expect(s.calls).toEqual([[REQUEST_ID, true]]);
    expect(s.server.status).toBe("approved");
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Approvals" })).queryByText("1")).not.toBeInTheDocument();
  });

  it("Reject calls the action with approve=false and the item disappears", async () => {
    s.me = B;
    const user = userEvent.setup();
    render(<Harness userId={B} />);
    await user.click(screen.getByRole("button", { name: "Approvals" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(screen.getByText("Nothing waiting for your approval.")).toBeInTheDocument());
    expect(s.calls).toEqual([[REQUEST_ID, false]]);
    expect(s.server.status).toBe("rejected");
  });

  it("shows the server's error and keeps the item when the action fails", async () => {
    s.me = B;
    s.override = { ok: false, error: "This request is no longer pending." };
    const user = userEvent.setup();
    render(<Harness userId={B} />);
    await user.click(screen.getByRole("button", { name: "Approvals" }));
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This request is no longer pending.");
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});

describe("approvals bell as requester A", () => {
  it("has no approve/reject buttons and no badge (A has no approval row)", async () => {
    s.me = A;
    const user = userEvent.setup();
    render(<Harness userId={A} />);

    const trigger = screen.getByRole("button", { name: "Approvals" });
    expect(within(trigger).queryByText("1")).not.toBeInTheDocument();
    await user.click(trigger);

    expect(screen.getByText("Nothing waiting for your approval.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(s.calls).toEqual([]);
  });
});

describe("asset page approval status panel", () => {
  const renderPanel = (userId: string, approval: "pending" | "approved" | "rejected") =>
    render(
      <LanguageProvider>
        <OwnershipStatusPanel assetId="asset-1" status={statusFor(userId, approval)} />
      </LanguageProvider>,
    );

  it("as A (requester): waiting state with the countdown and a resend button, never an approve button", () => {
    renderPanel(A, "pending");
    expect(screen.getByText("Change proposed by Alice Adams")).toBeInTheDocument();
    expect(screen.getByText("6 days left")).toBeInTheDocument();
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend approval request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Accept|Approve|Reject)$/ })).not.toBeInTheDocument();
  });

  it("as B (approver): sees the same waiting state but no resend and no approve button here", () => {
    renderPanel(B, "pending");
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend approval request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Accept|Approve|Reject)$/ })).not.toBeInTheDocument();
  });

  it("renders a rejected decision, without a resend button", () => {
    renderPanel(A, "rejected");
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for approval")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend approval request" })).not.toBeInTheDocument();
  });

  it("renders an approved decision", () => {
    renderPanel(A, "approved");
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });
});
