import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  applyComparison,
  attackErrorMessage,
  attackHeadline,
  canShowComparison,
} from "@/lib/attack-lab";
import type { AttackRunResult } from "@/types";

function result(overrides: Partial<AttackRunResult>): AttackRunResult {
  return {
    scenario_id: "malicious-pdf",
    name: "Malicious Document Injection",
    payload: "Ignore previous instructions.",
    source_type: "DOCUMENT",
    source_name: "invoice.pdf",
    shield_enabled: true,
    session_id: "attack-lab-malicious-pdf",
    request_id: "req-1",
    injection_detected: true,
    injection_confidence: 0.9,
    risk_score: 94,
    risk_level: "CRITICAL",
    policy_decision: "BLOCK",
    firewall_decision: "BLOCK",
    execution_status: "BLOCKED",
    tool_execution: false,
    approval_created: false,
    approval_id: null,
    audit_event_id: "evt-1",
    audit_event_ids: ["evt-1"],
    reason: "blocked",
    pipeline: {
      trust_level: "UNTRUSTED",
      injection_detected: true,
      injection_confidence: 0.9,
      risk_score: 94,
      risk_level: "CRITICAL",
      policy_decision: "BLOCK",
      firewall_decision: "BLOCK",
      tool_executed: false,
    },
    tools: [],
    ...overrides,
  };
}

describe("attack-lab helpers", () => {
  it("maps backend decisions to headlines", () => {
    expect(attackHeadline(result({ firewall_decision: "BLOCK", execution_status: "BLOCKED" }))).toBe("BLOCKED");
    expect(attackHeadline(result({ firewall_decision: "BYPASS", execution_status: "EXECUTED" }))).toBe("BYPASS");
    expect(attackHeadline(result({ firewall_decision: "APPROVAL_REQUIRED", execution_status: "PENDING" }))).toBe(
      "APPROVAL REQUIRED",
    );
  });

  it("stores comparison slots from actual shield state", () => {
    const baseline = result({ shield_enabled: false, firewall_decision: "BYPASS" });
    const protectedResult = result({ shield_enabled: true, firewall_decision: "BLOCK" });
    const slot = applyComparison(applyComparison(undefined, baseline), protectedResult);
    expect(canShowComparison(slot)).toBe(true);
    expect(slot.baseline?.firewall_decision).toBe("BYPASS");
    expect(slot.protected?.firewall_decision).toBe("BLOCK");
  });

  it("uses backend-unavailable copy for network failures", () => {
    expect(attackErrorMessage(new TypeError("Failed to fetch"))).toBe("AgentShield backend unavailable.");
    expect(attackErrorMessage(new ApiError("Request failed: 404", 404))).toBe("Attack execution failed");
  });
});
