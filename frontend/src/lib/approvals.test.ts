import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  approvalCounts,
  approvalErrorMessage,
  approvalPipelineStages,
  canApprove,
  canReject,
  countNewApprovalIds,
  formatExpiresIn,
  isBlockedPolicy,
  isPendingApproval,
  pendingApprovals,
  safeResultFields,
  toolTitle,
} from "@/lib/approvals";
import type { ApprovalRequest } from "@/types";

function item(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: "apr-1",
    request_id: "req-1",
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
    injection_confidence: 0,
    expires_at: "2026-09-20T10:15:00Z",
    execution_status: "NOT_EXECUTED",
    ...overrides,
  };
}

describe("approval helpers", () => {
  it("only treats pending non-block items as approvable", () => {
    expect(canApprove(item())).toBe(true);
    expect(canReject(item())).toBe(true);
    expect(canApprove(item({ status: "EXPIRED" }))).toBe(false);
    expect(canApprove(item({ policy_decision: "BLOCK" }))).toBe(false);
    expect(isBlockedPolicy(item({ policy_decision: "BLOCK" }))).toBe(true);
    expect(isPendingApproval(item({ policy_decision: "BLOCK" }))).toBe(false);
  });

  it("counts backend statuses without fabricating totals", () => {
    const counts = approvalCounts([
      item(),
      item({ id: "2", status: "EXECUTED" }),
      item({ id: "3", status: "REJECTED" }),
      item({ id: "4", status: "EXPIRED" }),
      item({ id: "5", policy_decision: "BLOCK" }),
    ]);
    expect(counts).toEqual({ pending: 1, approved: 1, rejected: 1, expired: 1 });
    expect(pendingApprovals([item(), item({ id: "x", policy_decision: "BLOCK" })])).toHaveLength(1);
  });

  it("formats expiry remaining and tool titles from actual values", () => {
    expect(toolTitle("send_email")).toBe("SEND EMAIL");
    expect(formatExpiresIn("2026-09-20T10:13:00Z", Date.parse("2026-09-20T10:00:00Z"))).toBe("13 minutes");
    expect(formatExpiresIn("2026-09-20T09:00:00Z", Date.parse("2026-09-20T10:00:00Z"))).toBe("Expired");
  });

  it("builds pipeline stages from the selected request", () => {
    const stages = approvalPipelineStages(item());
    expect(stages.map((stage) => stage.value)).toEqual([
      "USER_REQUEST",
      "TRUSTED",
      "RISK 58 / HIGH",
      "APPROVAL_REQUIRED",
      "WAITING FOR HUMAN",
      "NOT EXECUTED",
    ]);
  });

  it("redacts unlisted execution result fields", () => {
    expect(
      safeResultFields({
        status: "simulated",
        recipient: "manager@example.com",
        body: "confidential report",
        content: "secret",
        token: "abc",
      }),
    ).toEqual([
      { label: "status", value: "simulated" },
      { label: "recipient", value: "manager@example.com" },
    ]);
  });

  it("counts newly arrived pending ids", () => {
    expect(countNewApprovalIds([item()], [item({ id: "apr-2" }), item()])).toEqual(["apr-2"]);
  });

  it("uses a safe backend error message", () => {
    expect(approvalErrorMessage(new ApiError("Request failed: 409", 409, "Request has expired."))).toBe(
      "Request has expired.",
    );
    expect(approvalErrorMessage(new ApiError("Request failed: 409", 409, "Traceback (most recent call last)"))).toBe(
      "This request is no longer pending.",
    );
  });
});
