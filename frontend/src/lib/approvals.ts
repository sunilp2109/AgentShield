import { ApiError } from "@/lib/api";
import { looksSensitive, safeDisplay } from "@/lib/audit";
import { formatSourceLabel } from "@/lib/format-time";
import type { ApprovalRequest } from "@/types";

export const APPROVAL_POLL_INTERVAL_MS = 5000;

const RESULT_ALLOWLIST = new Set(["status", "recipient", "tool", "simulated"]);

export type ApprovalCounts = {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
};

export function isBlockedPolicy(item: ApprovalRequest): boolean {
  return item.policy_decision === "BLOCK";
}

export function isPendingApproval(item: ApprovalRequest): boolean {
  return item.status === "PENDING" && !isBlockedPolicy(item);
}

export function canApprove(item: ApprovalRequest): boolean {
  return isPendingApproval(item);
}

export function canReject(item: ApprovalRequest): boolean {
  return isPendingApproval(item);
}

export function pendingApprovals(items: ApprovalRequest[]): ApprovalRequest[] {
  return items.filter(isPendingApproval);
}

export function approvalCounts(items: ApprovalRequest[]): ApprovalCounts {
  return {
    pending: items.filter(isPendingApproval).length,
    approved: items.filter((item) =>
      item.status === "APPROVED" || item.status === "EXECUTED" || item.status === "EXECUTION_FAILED",
    ).length,
    rejected: items.filter((item) => item.status === "REJECTED").length,
    expired: items.filter((item) => item.status === "EXPIRED").length,
  };
}

export function toolTitle(name: string): string {
  return name.replace(/_/g, " ").toUpperCase();
}

export function approvalSourceLabel(sourceType: string | null | undefined): string {
  return formatSourceLabel(sourceType);
}

export function formatExpiresIn(expiresAt: string, now = Date.now()): string {
  const then = Date.parse(expiresAt);
  if (Number.isNaN(then)) {
    return "Not recorded";
  }
  const remainingMs = then - now;
  if (remainingMs <= 0) {
    return "Expired";
  }
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function countNewApprovalIds(previous: ApprovalRequest[] | null, incoming: ApprovalRequest[]): string[] {
  if (!previous || previous.length === 0) {
    return [];
  }
  const known = new Set(previous.map((item) => item.id));
  return incoming.filter((item) => !known.has(item.id)).map((item) => item.id);
}

export function approvalErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.detail?.trim();
    if (detail && !looksSensitive(detail) && !isStackTrace(detail)) {
      return detail;
    }
    if (error.status === 409) {
      return "This request is no longer pending.";
    }
    if (error.status === 404) {
      return "Approval request not found.";
    }
  }
  return "Unable to complete this review.";
}

export function executionSucceeded(item: ApprovalRequest): boolean {
  return item.status === "EXECUTED" && item.execution_status === "EXECUTED";
}

export function executionFailed(item: ApprovalRequest): boolean {
  return item.status === "EXECUTION_FAILED" || item.execution_status === "ERROR";
}

export function safeResultFields(result: ApprovalRequest["result"]): { label: string; value: string }[] {
  if (!result || typeof result !== "object") {
    return [];
  }
  const fields: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(result)) {
    if (!RESULT_ALLOWLIST.has(key)) {
      continue;
    }
    if (value == null || typeof value === "object") {
      continue;
    }
    const display = safeDisplay(value as string | number | boolean);
    if (display === "Redacted") {
      continue;
    }
    fields.push({ label: key.replace(/_/g, " "), value: display });
  }
  return fields;
}

export function approvalPipelineStages(item: ApprovalRequest): { label: string; value: string | null }[] {
  const risk =
    item.risk_score != null || item.risk_level
      ? `RISK ${[item.risk_score, item.risk_level].filter((part) => part != null && part !== "").join(" / ")}`
      : null;
  return [
    { label: "Source", value: item.source_type },
    { label: "Trust", value: item.trust_level ?? null },
    { label: "Risk", value: risk },
    { label: "Policy", value: item.policy_decision },
    { label: "Approval", value: approvalStageLabel(item) },
    { label: "Tool", value: toolStageLabel(item) },
  ];
}

function approvalStageLabel(item: ApprovalRequest): string {
  if (isBlockedPolicy(item)) {
    return "BLOCKED BY POLICY";
  }
  if (item.status === "PENDING") {
    return "WAITING FOR HUMAN";
  }
  if (item.status === "REJECTED") {
    return "REJECTED";
  }
  if (item.status === "EXPIRED") {
    return "EXPIRED";
  }
  if (item.status === "APPROVED" || item.status === "EXECUTED" || item.status === "EXECUTION_FAILED") {
    return "APPROVED";
  }
  return item.status;
}

function toolStageLabel(item: ApprovalRequest): string {
  if (executionSucceeded(item)) {
    return "EXECUTED";
  }
  if (executionFailed(item)) {
    return "EXECUTION FAILED";
  }
  if (item.execution_status === "NOT_EXECUTED" || item.execution_status === "PENDING") {
    return "NOT EXECUTED";
  }
  return item.execution_status || "NOT EXECUTED";
}

function isStackTrace(value: string): boolean {
  return /traceback|file "|\s+at\s+\S+\s+\(/i.test(value);
}
