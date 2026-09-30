import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApprovalReviewDrawer } from "@/components/approvals/ApprovalReviewDrawer";
import { ApprovalsView } from "@/components/approvals/ApprovalsView";
import { approveApproval, getApproval, getApprovals, rejectApproval } from "@/lib/security-api";
import type { ApprovalRequest } from "@/types";

vi.mock("@/lib/security-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security-api")>("@/lib/security-api");
  return {
    ...actual,
    getApprovals: vi.fn(),
    getApproval: vi.fn(),
    approveApproval: vi.fn(),
    rejectApproval: vi.fn(),
  };
});

function item(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: "apr-1",
    request_id: "req-apr-1",
    session_id: "approval-demo",
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    status: "PENDING",
    tool_name: "send_email",
    action: "send_email",
    target_resource: "manager@example.com",
    source_type: "USER_REQUEST",
    source_name: "user",
    trust_level: "TRUSTED",
    risk_score: 58,
    risk_level: "HIGH",
    policy_decision: "APPROVAL_REQUIRED",
    reason: "External email transmission requires human approval.",
    destination_type: "EXTERNAL_EMAIL",
    injection_detected: false,
    injection_confidence: 0.1,
    expires_at: "2099-09-20T10:15:00Z",
    execution_status: "NOT_EXECUTED",
    execution_result_summary: null,
    result: null,
    ...overrides,
  };
}

const PENDING = item();
const EXECUTED = item({
  status: "EXECUTED",
  execution_status: "EXECUTED",
  execution_result_summary: "Approved action executed.",
  result: {
    status: "simulated",
    recipient: "manager@example.com",
    body: "password=should-not-render",
    content: "CONFIDENTIAL - INTERNAL ONLY",
  },
});
const REJECTED = item({
  status: "REJECTED",
  execution_status: "NOT_EXECUTED",
  rejection_reason: "Not needed",
});
const EXPIRED = item({ status: "EXPIRED", execution_status: "NOT_EXECUTED" });
const BLOCKED = item({
  id: "apr-block",
  policy_decision: "BLOCK",
  reason: "Untrusted content attempted to send an external email.",
});

function renderQueue(pollIntervalMs = 0) {
  return render(<ApprovalsView pollIntervalMs={pollIntervalMs} />);
}

async function openReview(target: ApprovalRequest = PENDING) {
  vi.mocked(getApproval).mockResolvedValue(target);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByRole("dialog", { name: /Review SEND EMAIL/i })).toBeInTheDocument();
}

describe("ApprovalsView", () => {
  beforeEach(() => {
    vi.mocked(getApprovals).mockReset();
    vi.mocked(getApproval).mockReset();
    vi.mocked(approveApproval).mockReset();
    vi.mocked(rejectApproval).mockReset();
    vi.mocked(getApprovals).mockResolvedValue([PENDING]);
    vi.mocked(getApproval).mockResolvedValue(PENDING);
    vi.mocked(approveApproval).mockResolvedValue(EXECUTED);
    vi.mocked(rejectApproval).mockResolvedValue(REJECTED);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders the approval page from the backend queue", async () => {
    renderQueue();
    expect(await screen.findByText("Human Approval Queue")).toBeInTheDocument();
    expect(screen.getByText("Review agent actions that require authorization before execution.")).toBeInTheDocument();
    expect(screen.getByText("Approval system connected")).toBeInTheDocument();
    expect(screen.getByText("SEND EMAIL")).toBeInTheDocument();
    expect(screen.getByText("External email transmission requires human approval.")).toBeInTheDocument();
  });

  it("renders statistics from actual API values", async () => {
    vi.mocked(getApprovals).mockResolvedValue([PENDING, EXECUTED, REJECTED, EXPIRED]);
    renderQueue();
    expect(await screen.findByText("Pending: 1")).toBeInTheDocument();
    const summary = screen.getByLabelText("Approval summary");
    expect(within(summary).getByText("Pending Approvals")).toBeInTheDocument();
    expect(within(summary).getByText("Approved").parentElement).toHaveTextContent("1");
    expect(within(summary).getByText("Rejected").parentElement).toHaveTextContent("1");
    expect(within(summary).getByText("Expired").parentElement).toHaveTextContent("1");
  });

  it("renders pending approval cards", async () => {
    renderQueue();
    expect(await screen.findByText("manager@example.com")).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
    expect(screen.getByText("58 / 100")).toBeInTheDocument();
    expect(screen.getByText("NOT DETECTED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
  });

  it("renders the empty state without creating fake requests", async () => {
    vi.mocked(getApprovals).mockResolvedValue([]);
    renderQueue();
    expect(await screen.findByText("No pending approvals")).toBeInTheDocument();
    expect(
      screen.getByText("AgentShield has no actions waiting for human authorization."),
    ).toBeInTheDocument();
    expect(screen.queryByText("SEND EMAIL")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  });

  it("renders skeleton cards while loading", () => {
    vi.mocked(getApprovals).mockReturnValue(new Promise(() => undefined));
    renderQueue();
    expect(screen.getByTestId("approvals-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("SEND EMAIL")).not.toBeInTheDocument();
  });

  it("renders an error state with retry", async () => {
    vi.mocked(getApprovals).mockRejectedValue(new Error("offline"));
    renderQueue();
    expect(await screen.findByText("Unable to load approval queue.")).toBeInTheDocument();
    vi.mocked(getApprovals).mockResolvedValue([PENDING]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("SEND EMAIL")).toBeInTheDocument();
  });

  it("opens approval details from Review", async () => {
    renderQueue();
    await openReview();
    expect(screen.getByText("apr-1")).toBeInTheDocument();
    expect(screen.getByText("req-apr-1")).toBeInTheDocument();
    expect(screen.getByText("approval-demo")).toBeInTheDocument();
    expect(screen.getAllByText("TRUSTED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("WAITING FOR HUMAN").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NOT EXECUTED").length).toBeGreaterThan(0);
  });

  it("shows approve confirmation before calling the backend", async () => {
    renderQueue();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Approve & Execute" }));
    const confirm = screen.getByRole("dialog", { name: "Approve this action?" });
    expect(within(confirm).getByText(/authorize the pending action/i)).toBeInTheDocument();
    expect(approveApproval).not.toHaveBeenCalled();
  });

  it("approves through the backend API and shows the execution result", async () => {
    vi.mocked(getApprovals)
      .mockResolvedValueOnce([PENDING])
      .mockResolvedValue([EXECUTED]);
    renderQueue();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Approve & Execute" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Approve this action?" })).getByRole("button", { name: "Approve & Execute" }));
    await waitFor(() => {
      expect(approveApproval).toHaveBeenCalledWith("apr-1");
    });
    expect(await screen.findByText("✓ Tool executed")).toBeInTheDocument();
    expect(screen.getByText("✓ Human approval granted")).toBeInTheDocument();
    expect(screen.getByText("simulated")).toBeInTheDocument();
    expect(screen.queryByText("password=should-not-render")).not.toBeInTheDocument();
    expect(screen.queryByText("CONFIDENTIAL - INTERNAL ONLY")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  });

  it("shows reject confirmation and removes the request after backend confirmation", async () => {
    vi.mocked(getApprovals)
      .mockResolvedValueOnce([PENDING])
      .mockResolvedValue([REJECTED]);
    renderQueue();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const confirm = screen.getByRole("dialog", { name: "Reject this action?" });
    fireEvent.change(within(confirm).getByLabelText("Why are you rejecting this request?"), {
      target: { value: "Not needed" },
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Reject Action" }));
    await waitFor(() => {
      expect(rejectApproval).toHaveBeenCalledWith("apr-1", { reason: "Not needed" });
    });
    expect((await screen.findAllByText("REJECTED")).length).toBeGreaterThan(0);
    expect(screen.getByText("Execution: NOT EXECUTED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
    expect(screen.getByText("No pending approvals")).toBeInTheDocument();
  });

  it("polls the approval queue and cleans up on unmount", async () => {
    const view = renderQueue(40);
    await screen.findByText("SEND EMAIL");
    const afterLoad = vi.mocked(getApprovals).mock.calls.length;
    await waitFor(
      () => {
        expect(vi.mocked(getApprovals).mock.calls.length).toBeGreaterThan(afterLoad);
      },
      { timeout: 500 },
    );
    view.unmount();
    const afterUnmount = vi.mocked(getApprovals).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(vi.mocked(getApprovals).mock.calls.length).toBe(afterUnmount);
  });

  it("does not render blocked policy items as approvable cards", async () => {
    vi.mocked(getApprovals).mockResolvedValue([PENDING, BLOCKED]);
    renderQueue();
    expect(await screen.findByRole("button", { name: "Review" })).toBeInTheDocument();
    expect(screen.queryByText("BLOCKED BY POLICY")).not.toBeInTheDocument();
    expect(screen.getByText("Pending: 1")).toBeInTheDocument();
  });

  it("does not display sensitive fields returned by the backend", async () => {
    vi.mocked(getApprovals).mockResolvedValue([
      item({ reason: "password=super-secret and api_key=abcd" }),
    ]);
    renderQueue();
    expect(await screen.findByText("Redacted")).toBeInTheDocument();
    expect(screen.queryByText(/super-secret/)).not.toBeInTheDocument();
    expect(screen.queryByText(/api_key=abcd/)).not.toBeInTheDocument();
  });

  it("copies the request id", async () => {
    renderQueue();
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("req-apr-1");
    });
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });
});

describe("ApprovalReviewDrawer guards", () => {
  it("does not allow approving an expired request", () => {
    render(
      <ApprovalReviewDrawer
        item={EXPIRED}
        onClose={() => undefined}
        onCopyRequestId={() => undefined}
        onApprove={() => undefined}
        onReject={() => undefined}
      />,
    );
    expect(screen.getAllByText(/EXPIRED/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Approve & Execute" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("does not show Approve for a BLOCKED action", () => {
    render(
      <ApprovalReviewDrawer
        item={BLOCKED}
        onClose={() => undefined}
        onCopyRequestId={() => undefined}
        onApprove={() => undefined}
        onReject={() => undefined}
      />,
    );
    expect(screen.getAllByText(/BLOCKED BY POLICY/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Approve & Execute" })).not.toBeInTheDocument();
  });
});
