import { ApiError } from "@/lib/api";
import type { AttackRunResult } from "@/types";

export const DEFAULT_ATTACK_SCENARIO_ID = "malicious-pdf";

export type ComparisonSlot = {
  baseline: AttackRunResult | null;
  protected: AttackRunResult | null;
};

export function applyComparison(current: ComparisonSlot | undefined, result: AttackRunResult): ComparisonSlot {
  const next = current ?? { baseline: null, protected: null };
  if (result.shield_enabled) {
    return { ...next, protected: result };
  }
  return { ...next, baseline: result };
}

export function canShowComparison(slot: ComparisonSlot | null | undefined): boolean {
  return Boolean(slot?.baseline && slot?.protected);
}

export function attackHeadline(result: AttackRunResult): string {
  const decision = result.firewall_decision ?? "";
  const status = result.execution_status ?? "";
  if (decision === "BLOCK" || status === "BLOCKED") {
    return "BLOCKED";
  }
  if (decision === "BYPASS" || status === "BYPASSED") {
    return "BYPASS";
  }
  if (decision === "APPROVAL_REQUIRED" || status === "PENDING" || status === "PENDING_APPROVAL") {
    return "APPROVAL REQUIRED";
  }
  return decision || status || "UNKNOWN";
}

export function isBackendUnavailable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500;
  }
  return true;
}

export function attackErrorMessage(error: unknown): string {
  return isBackendUnavailable(error) ? "AgentShield backend unavailable." : "Attack execution failed";
}
