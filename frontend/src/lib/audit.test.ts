import { describe, expect, it } from "vitest";

import {
  buildAuditEventsPath,
  countNewEventIds,
  decisionLabel,
  executionLabel,
  formatAuditClock,
  looksSensitive,
  safeDisplay,
  searchEvents,
  toAuditQuery,
} from "@/lib/audit";
import type { SecurityEvent } from "@/types";

function event(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: "evt-1",
    timestamp: "2026-09-20T10:42:11Z",
    session_id: "demo-attack-001",
    request_id: "req-abc123",
    shield_enabled: true,
    source_type: "DOCUMENT",
    source_name: "invoice.pdf",
    trust_level: "UNTRUSTED",
    user_intent: "ignore this",
    tool_name: "send_email",
    action: "send_email",
    target_resource: "attacker@example.com",
    data_sensitivity: "CRITICAL",
    destination_type: "EXTERNAL_EMAIL",
    injection_detected: true,
    injection_confidence: 0.97,
    risk_score: 94,
    risk_level: "CRITICAL",
    policy_decision: "BLOCK",
    firewall_decision: "BLOCK",
    execution_status: "BLOCKED",
    execution_result_summary: "blocked",
    block_reason: "Untrusted content attempted to access a private or sensitive file.",
    approval_required: false,
    created_at: "2026-09-20T10:42:11Z",
    ...overrides,
  };
}

describe("audit helpers", () => {
  it("builds backend filter queries without inventing unsupported params", () => {
    expect(
      toAuditQuery(
        {
          decision: "BLOCK",
          riskLevel: "CRITICAL",
          injection: "DETECTED",
          shield: "ON",
          sourceType: "DOCUMENT",
          sessionId: "demo-attack-001",
        },
        25,
        25,
      ),
    ).toEqual({
      decision: "BLOCK",
      risk_level: "CRITICAL",
      injection_detected: true,
      shield_enabled: true,
      source_type: "DOCUMENT",
      session_id: "demo-attack-001",
      limit: 25,
      offset: 25,
    });
    expect(buildAuditEventsPath({ decision: "BYPASS", shield_enabled: false, limit: 25, offset: 0 })).toContain(
      "decision=BYPASS",
    );
  });

  it("searches the current event page only", () => {
    const events = [
      event(),
      event({ id: "evt-2", tool_name: "browse_url", action: "browse_url", request_id: "req-safe", session_id: "safe" }),
    ];
    expect(searchEvents(events, "send_email")).toHaveLength(1);
    expect(searchEvents(events, "req-abc123")[0].id).toBe("evt-1");
    expect(searchEvents(events, "demo-attack-001")).toHaveLength(1);
  });

  it("redacts sensitive strings and maps labels", () => {
    expect(looksSensitive("api_key=sk_live_demo")).toBe(true);
    expect(safeDisplay("password=hunter2")).toBe("Redacted");
    expect(safeDisplay(null)).toBe("Not recorded");
    expect(decisionLabel("BLOCK")).toBe("BLOCKED");
    expect(decisionLabel("APPROVAL_REQUIRED")).toBe("APPROVAL REQUIRED");
    expect(executionLabel("PENDING_APPROVAL")).toBe("PENDING");
    expect(executionLabel("BYPASSED")).toBe("EXECUTED");
    expect(formatAuditClock("2026-09-20T10:42:11Z")).toBe("10:42:11");
  });

  it("counts only newly arrived event ids", () => {
    expect(countNewEventIds(null, [event()])).toEqual([]);
    expect(countNewEventIds([event()], [event(), event({ id: "evt-2" })])).toEqual(["evt-2"]);
  });
});
