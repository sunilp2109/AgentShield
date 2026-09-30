import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveActivityPanel } from "@/components/security/LiveActivityPanel";
import { OverviewMetricCard } from "@/components/security/OverviewMetricCard";
import type { SecurityEvent } from "@/types";

const sampleEvent: SecurityEvent = {
  id: "evt-1",
  timestamp: "2026-09-20T10:00:00Z",
  session_id: "demo",
  request_id: "req-1",
  shield_enabled: true,
  source_type: "USER_REQUEST",
  source_name: "user",
  trust_level: "TRUSTED",
  user_intent: null,
  tool_name: "browse_url",
  action: "browse_url",
  target_resource: "https://intranet.acme.local/handbook",
  data_sensitivity: "NORMAL",
  destination_type: "WEB_PAGE",
  injection_detected: false,
  injection_confidence: 0,
  risk_score: 10,
  risk_level: "LOW",
  policy_decision: "ALLOW",
  firewall_decision: "ALLOW",
  execution_status: "EXECUTED",
  execution_result_summary: "Simulated page opened.",
  block_reason: null,
  approval_required: false,
  created_at: "2026-09-20T10:00:00Z",
};

const blockedEvent: SecurityEvent = {
  ...sampleEvent,
  id: "evt-2",
  tool_name: "send_email",
  source_type: "DOCUMENT",
  firewall_decision: "BLOCK",
  policy_decision: "BLOCK",
  risk_score: 94,
  risk_level: "CRITICAL",
};

describe("loading empty and error states", () => {
  it("renders a live activity loading skeleton", () => {
    render(<LiveActivityPanel status="loading" />);
    expect(screen.getByTestId("activity-skeleton")).toBeInTheDocument();
  });

  it("renders an empty live activity state", () => {
    render(<LiveActivityPanel status="empty" />);
    expect(screen.getByText("No security activity yet.")).toBeInTheDocument();
    expect(
      screen.getByText("AgentShield events will appear here when the agent performs actions."),
    ).toBeInTheDocument();
  });

  it("renders a live activity error state", () => {
    render(<LiveActivityPanel status="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load security activity.");
  });

  it("renders successful activity rows", () => {
    render(<LiveActivityPanel status="success" events={[sampleEvent]} />);
    expect(screen.getByText("USER → browse_url")).toBeInTheDocument();
    expect(screen.getByText("ALLOW")).toBeInTheDocument();
  });

  it("renders BLOCK events", () => {
    render(<LiveActivityPanel status="success" events={[blockedEvent]} />);
    expect(screen.getByText("BLOCK")).toBeInTheDocument();
    expect(screen.getByText("DOCUMENT → send_email")).toBeInTheDocument();
  });

  it("filters activity rows", () => {
    render(
      <LiveActivityPanel
        status="success"
        events={[sampleEvent, blockedEvent]}
        filter="BLOCK"
        onFilterChange={() => undefined}
      />,
    );
    expect(screen.getByText("BLOCK")).toBeInTheDocument();
    expect(screen.queryByText("ALLOW")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Blocked" })).toHaveAttribute("aria-selected", "true");
  });

  it("invokes filter changes", () => {
    let current = "ALL";
    function Harness() {
      return (
        <LiveActivityPanel
          status="success"
          events={[sampleEvent, blockedEvent]}
          filter={current as "ALL"}
          onFilterChange={(next) => {
            current = next;
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Allowed" }));
    expect(current).toBe("ALLOW");
  });

  it("renders metric loading empty and error states", () => {
    const { rerender } = render(
      <OverviewMetricCard label="Threats Blocked" state="loading" />,
    );
    expect(screen.getByTestId("metric-skeleton")).toBeInTheDocument();

    rerender(<OverviewMetricCard label="Threats Blocked" state="empty" />);
    expect(screen.getByText("—")).toBeInTheDocument();

    rerender(<OverviewMetricCard label="Threats Blocked" state="error" />);
    expect(screen.getByText("Statistics unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders zero metric values", () => {
    render(<OverviewMetricCard label="Threats Blocked" value={0} state="ready" />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
