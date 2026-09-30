import { describe, expect, it } from "vitest";

import { filterActivityEvents, mergeSecurityEvents, riskDistribution, toolActivityCounts } from "@/lib/dashboard-data";
import type { SecurityEvent } from "@/types";

function event(overrides: Partial<SecurityEvent>): SecurityEvent {
  return {
    id: "a",
    timestamp: "2026-09-20T10:00:00Z",
    session_id: "demo",
    request_id: "req",
    shield_enabled: true,
    source_type: "USER_REQUEST",
    source_name: null,
    trust_level: null,
    user_intent: null,
    tool_name: "browse_url",
    action: "browse_url",
    target_resource: null,
    data_sensitivity: null,
    destination_type: null,
    injection_detected: false,
    injection_confidence: 0,
    risk_score: 10,
    risk_level: "LOW",
    policy_decision: "ALLOW",
    firewall_decision: "ALLOW",
    execution_status: "EXECUTED",
    execution_result_summary: null,
    block_reason: null,
    approval_required: false,
    created_at: "2026-09-20T10:00:00Z",
    ...overrides,
  };
}

describe("dashboard data helpers", () => {
  it("merges events without duplicates and reports new ids", () => {
    const previous = [event({ id: "a", timestamp: "2026-09-20T10:00:00Z" })];
    const incoming = [
      event({ id: "b", timestamp: "2026-09-20T10:00:05Z", firewall_decision: "BLOCK" }),
      event({ id: "a", timestamp: "2026-09-20T10:00:00Z" }),
    ];
    const merged = mergeSecurityEvents(previous, incoming, 20);
    expect(merged.events?.map((item) => item.id)).toEqual(["b", "a"]);
    expect(merged.newIds).toEqual(["b"]);
  });

  it("filters activity by decision", () => {
    const events = [
      event({ id: "allow", firewall_decision: "ALLOW" }),
      event({ id: "block", firewall_decision: "BLOCK" }),
    ];
    expect(filterActivityEvents(events, "BLOCK").map((item) => item.id)).toEqual(["block"]);
  });

  it("counts tools from events without hardcoding the catalog", () => {
    const counts = toolActivityCounts([
      event({ id: "1", tool_name: "browse_url" }),
      event({ id: "2", tool_name: "browse_url" }),
      event({ id: "3", tool_name: "send_email" }),
      event({ id: "4", tool_name: "shield" }),
    ]);
    expect(counts).toEqual([
      { tool: "browse_url", count: 2 },
      { tool: "send_email", count: 1 },
    ]);
  });

  it("uses stats risk buckets when present", () => {
    expect(
      riskDistribution(
        {
          total_events: 4,
          allowed: 0,
          approval_required: 0,
          blocked: 0,
          bypassed: 0,
          injections_detected: 0,
          critical_events: 1,
          average_risk_score: null,
          shield_on_events: 0,
          shield_off_events: 0,
          risk_low: 1,
          risk_medium: 2,
          risk_high: 0,
          risk_critical: 3,
        },
        [],
      ),
    ).toEqual({ LOW: 1, MEDIUM: 2, HIGH: 0, CRITICAL: 3 });
  });
});
