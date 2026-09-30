import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ComparisonView } from "@/components/attack-lab/ComparisonView";
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

describe("ComparisonView", () => {
  it("shows baseline and protected results without good/bad labels", () => {
    render(
      <ComparisonView
        baseline={result({
          shield_enabled: false,
          firewall_decision: "BYPASS",
          execution_status: "EXECUTED",
          tool_execution: true,
          injection_detected: true,
        })}
        protectedResult={result({
          shield_enabled: true,
          firewall_decision: "BLOCK",
          execution_status: "BLOCKED",
          tool_execution: false,
        })}
      />,
    );
    expect(screen.getByText("BASELINE")).toBeInTheDocument();
    expect(screen.getByText("PROTECTED")).toBeInTheDocument();
    expect(screen.getByText("BYPASS")).toBeInTheDocument();
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
    expect(screen.queryByText(/good/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bad/i)).not.toBeInTheDocument();
  });
});
