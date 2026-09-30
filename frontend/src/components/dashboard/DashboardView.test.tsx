import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { SecurityConsoleProvider } from "@/components/security/SecurityConsoleProvider";
import type { ApprovalRequest, AuditStats, SecurityEvent } from "@/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const EMPTY_STATS: AuditStats = {
  total_events: 0,
  allowed: 0,
  approval_required: 0,
  blocked: 0,
  bypassed: 0,
  injections_detected: 0,
  critical_events: 0,
  average_risk_score: null,
  shield_on_events: 0,
  shield_off_events: 0,
  risk_low: 0,
  risk_medium: 0,
  risk_high: 0,
  risk_critical: 0,
};

const POPULATED_STATS: AuditStats = {
  ...EMPTY_STATS,
  total_events: 4,
  allowed: 1,
  approval_required: 1,
  blocked: 1,
  bypassed: 1,
  injections_detected: 1,
  critical_events: 1,
  average_risk_score: 61.5,
  risk_low: 1,
  risk_medium: 1,
  risk_high: 0,
  risk_critical: 1,
};

function event(overrides: Partial<SecurityEvent>): SecurityEvent {
  return {
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
    execution_result_summary: "ok",
    block_reason: null,
    approval_required: false,
    created_at: "2026-09-20T10:00:00Z",
    ...overrides,
  };
}

const SAMPLE_EVENTS: SecurityEvent[] = [
  event({
    id: "evt-allow",
    tool_name: "browse_url",
    firewall_decision: "ALLOW",
    policy_decision: "ALLOW",
    risk_score: 12,
    risk_level: "LOW",
  }),
  event({
    id: "evt-approval",
    tool_name: "send_email",
    source_type: "USER_REQUEST",
    firewall_decision: "APPROVAL_REQUIRED",
    policy_decision: "APPROVAL_REQUIRED",
    risk_score: 58,
    risk_level: "HIGH",
    approval_required: true,
  }),
  event({
    id: "evt-block",
    tool_name: "send_email",
    source_type: "DOCUMENT",
    firewall_decision: "BLOCK",
    policy_decision: "BLOCK",
    risk_score: 94,
    risk_level: "CRITICAL",
    injection_detected: true,
  }),
  event({
    id: "evt-bypass",
    tool_name: "read_file",
    source_type: "DOCUMENT",
    firewall_decision: "BYPASS",
    policy_decision: "BYPASS",
    risk_score: 90,
    risk_level: "CRITICAL",
    shield_enabled: false,
  }),
];

const SAMPLE_APPROVAL: ApprovalRequest = {
  id: "apr-1",
  request_id: "req-apr",
  session_id: "demo",
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
  status: "PENDING",
  tool_name: "send_email",
  action: "send_email",
  target_resource: "manager@acme.local",
  source_type: "USER_REQUEST",
  source_name: "user",
  risk_score: 58,
  risk_level: "HIGH",
  policy_decision: "APPROVAL_REQUIRED",
  reason: null,
  destination_type: "EMAIL",
  injection_detected: false,
  expires_at: "2026-09-20T10:10:00Z",
  execution_status: "PENDING",
};

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  });
}

function mockBackend(options?: {
  enabled?: boolean;
  stats?: AuditStats;
  events?: SecurityEvent[];
  approvals?: ApprovalRequest[];
}) {
  const enabled = options?.enabled ?? true;
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/health")) return jsonResponse({ status: "ok", shield_enabled: enabled });
    if (url.includes("/security/status")) {
      return jsonResponse({
        shield_enabled: enabled,
        enabled,
        mode: enabled ? "PROTECTED" : "BASELINE",
      });
    }
    if (url.includes("/audit/stats")) return jsonResponse(options?.stats ?? EMPTY_STATS);
    if (url.includes("/audit/events")) return jsonResponse(options?.events ?? []);
    if (url.includes("/approvals")) return jsonResponse(options?.approvals ?? []);
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDashboard(pollIntervalMs = 0) {
  return render(
    <SecurityConsoleProvider pollIntervalMs={pollIntervalMs}>
      <DashboardView />
    </SecurityConsoleProvider>,
  );
}

describe("DashboardView", () => {
  it("renders the overview heading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderDashboard();
    expect(screen.getByText("Agent Security Overview")).toBeInTheDocument();
    expect(screen.getByText("Real-time protection and agent activity")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("AgentShield backend unavailable").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Protection status cannot be verified.").length).toBeGreaterThan(0);
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
    expect(screen.queryByText("Shield Active")).not.toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
    expect(screen.queryByText("28")).not.toBeInTheDocument();
  });

  it("does not crash when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(() => renderDashboard()).not.toThrow();
    await waitFor(() => {
      expect(screen.getByLabelText("Live activity")).toBeInTheDocument();
    });
  });

  it("shows a loading state before backend data arrives", () => {
    mockBackend();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => undefined)));
    renderDashboard();
    expect(screen.getAllByText("LOADING").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("metric-skeleton").length).toBeGreaterThan(0);
    expect(screen.getByTestId("activity-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
  });

  it("shows PROTECTED when the backend reports Shield ON", async () => {
    mockBackend({ enabled: true });
    renderDashboard();
    expect(await screen.findByText("PROTECTED")).toBeInTheDocument();
    expect(screen.getByText("AgentShield is actively enforcing security policies.")).toBeInTheDocument();
    expect(screen.getByText("Shield Active")).toBeInTheDocument();
  });

  it("shows PROTECTION DISABLED when the backend reports Shield OFF", async () => {
    mockBackend({ enabled: false });
    renderDashboard();
    expect(await screen.findByText("PROTECTION DISABLED")).toBeInTheDocument();
    expect(screen.getByText("Security enforcement is currently bypassed.")).toBeInTheDocument();
    expect(screen.getByText("Shield Disabled")).toBeInTheDocument();
  });

  it("renders zero metric values from the API", async () => {
    mockBackend({ stats: EMPTY_STATS, events: [], approvals: [] });
    renderDashboard();
    expect(await screen.findByText("Threats Blocked")).toBeInTheDocument();
    expect(screen.getByText("No threats detected.")).toBeInTheDocument();
    expect(screen.getAllByText("No security activity yet.").length).toBeGreaterThan(0);
    expect(screen.getByText("No pending approvals.")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("renders API metric values and recent events", async () => {
    mockBackend({
      stats: POPULATED_STATS,
      events: SAMPLE_EVENTS,
      approvals: [SAMPLE_APPROVAL],
    });
    renderDashboard();
    expect(await screen.findAllByText("BLOCK")).toHaveLength(2);
    expect(screen.getAllByText("ALLOW").length).toBeGreaterThan(0);
    expect(screen.getAllByText("APPROVAL REQUIRED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BYPASS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DOCUMENT → send_email").length).toBeGreaterThan(0);
    expect(screen.getByText("1 pending")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all approvals →" })).toHaveAttribute("href", "/approvals");
    expect(screen.getByRole("link", { name: /Pending Approvals/i })).toHaveAttribute("href", "/approvals");
    expect(screen.getAllByText("Prompt Injections").length).toBeGreaterThan(0);
  });

  it("filters recent activity", async () => {
    mockBackend({ stats: POPULATED_STATS, events: SAMPLE_EVENTS, approvals: [] });
    renderDashboard();
    const activity = await screen.findByLabelText("Live activity");
    expect(within(activity).getByText("ALLOW")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Blocked" }));
    expect(within(activity).getByText("BLOCK")).toBeInTheDocument();
    expect(within(activity).queryByText("ALLOW")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Allowed" }));
    expect(within(activity).getByText("ALLOW")).toBeInTheDocument();
    expect(within(activity).queryByText("BLOCK")).not.toBeInTheDocument();
  });

  it("polls for new data and stops after unmount", async () => {
    const fetchMock = mockBackend({ enabled: true, stats: EMPTY_STATS, events: [] });
    const view = renderDashboard(40);
    await screen.findByText("PROTECTED");
    const afterLoad = fetchMock.mock.calls.length;
    await waitFor(
      () => {
        expect(fetchMock.mock.calls.length).toBeGreaterThan(afterLoad);
      },
      { timeout: 500 },
    );
    view.unmount();
    const afterUnmount = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fetchMock.mock.calls.length).toBe(afterUnmount);
  });
});
