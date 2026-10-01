import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditLogsView } from "@/components/audit/AuditLogsView";
import { getAuditEvents, getAuditStats } from "@/lib/security-api";
import type { AuditEventQuery } from "@/lib/audit";
import type { AuditStats, SecurityEvent } from "@/types";

vi.mock("@/lib/security-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security-api")>("@/lib/security-api");
  return {
    ...actual,
    getAuditEvents: vi.fn(),
    getAuditStats: vi.fn(),
    getAuditEvent: vi.fn(),
  };
});

const STATS: AuditStats = {
  total_events: 4,
  allowed: 1,
  approval_required: 1,
  blocked: 1,
  bypassed: 1,
  injections_detected: 2,
  critical_events: 2,
  average_risk_score: 61.5,
  shield_on_events: 3,
  shield_off_events: 1,
  risk_low: 1,
  risk_medium: 0,
  risk_high: 1,
  risk_critical: 2,
};

function event(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: "evt-block",
    timestamp: "2026-09-20T10:42:11Z",
    session_id: "demo-attack-001",
    request_id: "req-abc123",
    shield_enabled: true,
    source_type: "DOCUMENT",
    source_name: "invoice.pdf",
    trust_level: "UNTRUSTED",
    user_intent: "password=should-not-render",
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
    execution_result_summary: "CONFIDENTIAL - INTERNAL ONLY",
    block_reason: "Untrusted content attempted to access a private or sensitive file.",
    approval_required: false,
    created_at: "2026-09-20T10:42:11Z",
    ...overrides,
  };
}

const EVENTS: SecurityEvent[] = [
  event(),
  event({
    id: "evt-bypass",
    timestamp: "2026-09-20T10:38:05Z",
    request_id: "req-off",
    session_id: "attack-lab-malicious-pdf",
    user_intent: "Summarize financial-report.pdf",
    shield_enabled: false,
    firewall_decision: "BYPASS",
    policy_decision: "BYPASS",
    execution_status: "BYPASSED",
    injection_detected: true,
    risk_score: null,
    risk_level: null,
    block_reason: null,
  }),
  event({
    id: "evt-approval",
    timestamp: "2026-09-20T10:41:02Z",
    source_type: "USER_REQUEST",
    source_name: "user",
    tool_name: "send_email",
    firewall_decision: "APPROVAL_REQUIRED",
    policy_decision: "APPROVAL_REQUIRED",
    execution_status: "PENDING_APPROVAL",
    injection_detected: false,
    risk_score: 58,
    risk_level: "HIGH",
    approval_required: true,
    session_id: "audit-email",
    request_id: "req-email",
    shield_enabled: true,
  }),
  event({
    id: "evt-allow",
    timestamp: "2026-09-20T10:39:18Z",
    source_type: "USER_REQUEST",
    tool_name: "browse_url",
    action: "browse_url",
    firewall_decision: "ALLOW",
    policy_decision: "ALLOW",
    execution_status: "EXECUTED",
    injection_detected: false,
    risk_score: 12,
    risk_level: "LOW",
    session_id: "audit-safe",
    request_id: "req-safe",
    target_resource: "https://intranet.acme.local/handbook",
  }),
];

function queryOf(arg: number | AuditEventQuery | undefined): AuditEventQuery {
  if (typeof arg === "number" || arg == null) {
    return { limit: typeof arg === "number" ? arg : 25, offset: 0 };
  }
  return arg;
}

function renderAudit() {
  return render(<AuditLogsView pollIntervalMs={0} pageSize={2} />);
}

describe("AuditLogsView", () => {
  beforeEach(() => {
    vi.mocked(getAuditStats).mockResolvedValue(STATS);
    vi.mocked(getAuditEvents).mockImplementation(async (arg) => {
      const query = queryOf(arg);
      let rows = EVENTS;
      if (query.decision) rows = rows.filter((item) => item.firewall_decision === query.decision);
      if (query.risk_level) rows = rows.filter((item) => item.risk_level === query.risk_level);
      if (query.injection_detected === true) rows = rows.filter((item) => item.injection_detected);
      if (query.injection_detected === false) rows = rows.filter((item) => !item.injection_detected);
      if (query.shield_enabled === true) rows = rows.filter((item) => item.shield_enabled);
      if (query.shield_enabled === false) rows = rows.filter((item) => !item.shield_enabled);
      if (query.source_type === "DOCUMENT") rows = rows.filter((item) => item.source_type === "DOCUMENT");
      if (query.source_type === "USER_REQUEST") rows = rows.filter((item) => item.source_type === "USER_REQUEST");
      if (query.session_id) rows = rows.filter((item) => item.session_id === query.session_id);
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 2;
      return rows.slice(offset, offset + limit);
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the audit page, statistics, and events", async () => {
    renderAudit();
    expect(screen.getByText("Security Audit Logs")).toBeInTheDocument();
    expect(screen.getByText("Trace agent actions, security decisions, and tool execution.")).toBeInTheDocument();
    expect(await screen.findByText("Audit system connected")).toBeInTheDocument();
    expect(screen.getByText("Total Events")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.getAllByText("send_email").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BLOCKED").length).toBeGreaterThan(0);
  });

  it("renders a loading skeleton before events arrive", () => {
    vi.mocked(getAuditEvents).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(getAuditStats).mockImplementation(() => new Promise(() => undefined));
    renderAudit();
    expect(screen.getByTestId("audit-table-skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("metric-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("BLOCKED")).not.toBeInTheDocument();
  });

  it("renders the empty state from the API", async () => {
    vi.mocked(getAuditEvents).mockResolvedValue([]);
    vi.mocked(getAuditStats).mockResolvedValue({ ...STATS, total_events: 0, allowed: 0, blocked: 0, approval_required: 0, bypassed: 0, injections_detected: 0, critical_events: 0 });
    renderAudit();
    expect(await screen.findByText("No security events recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("Run an action from the Dashboard or Attack Lab to generate events.")).toBeInTheDocument();
  });

  it("renders the error state with retry", async () => {
    vi.mocked(getAuditEvents).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(getAuditStats).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(getAuditEvents).mockResolvedValueOnce(EVENTS);
    vi.mocked(getAuditStats).mockResolvedValueOnce(STATS);
    renderAudit();
    expect(await screen.findByText("Unable to load audit events.")).toBeInTheDocument();
    expect(screen.getByText("Audit system unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Audit system connected")).toBeInTheDocument();
  });

  it("filters by decision, risk, injection, shield, and source through the API", async () => {
    renderAudit();
    await screen.findByText("Audit system connected");
    fireEvent.click(screen.getByRole("button", { name: "Blocked" }));
    await waitFor(() => {
      const query = queryOf(vi.mocked(getAuditEvents).mock.calls.at(-1)?.[0]);
      expect(query.decision).toBe("BLOCK");
    });
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    await waitFor(() => {
      expect(queryOf(vi.mocked(getAuditEvents).mock.calls.at(-1)?.[0]).risk_level).toBe("CRITICAL");
    });
    fireEvent.click(within(screen.getByRole("group", { name: "Injection" })).getByRole("button", { name: "Detected" }));
    await waitFor(() => {
      expect(queryOf(vi.mocked(getAuditEvents).mock.calls.at(-1)?.[0]).injection_detected).toBe(true);
    });
    fireEvent.click(within(screen.getByRole("group", { name: "Shield" })).getByRole("button", { name: "OFF" }));
    await waitFor(() => {
      expect(queryOf(vi.mocked(getAuditEvents).mock.calls.at(-1)?.[0]).shield_enabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Document" }));
    await waitFor(() => {
      expect(queryOf(vi.mocked(getAuditEvents).mock.calls.at(-1)?.[0]).source_type).toBe("DOCUMENT");
    });
  });

  it("searches the currently retrieved events", async () => {
    render(<AuditLogsView pollIntervalMs={0} pageSize={10} />);
    await screen.findAllByText("browse_url");
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "req-abc123" } });
    await waitFor(() => {
      expect(screen.queryByText("browse_url")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("send_email").length).toBeGreaterThan(0);
  });

  it("paginates with previous and next", async () => {
    renderAudit();
    await screen.findByText("Audit system connected");
    const next = screen.getByRole("button", { name: "Next" });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(next);
    await waitFor(() => {
      expect(queryOf(vi.mocked(getAuditEvents).mock.calls.at(-1)?.[0]).offset).toBe(2);
    });
  });

  it("opens event details with allowed fields only", async () => {
    renderAudit();
    const row = await screen.findByRole("row", { name: /send_email BLOCK/i });
    fireEvent.click(row);
    const dialog = await screen.findByRole("dialog", { name: "Event Details" });
    expect(within(dialog).getByText("evt-block")).toBeInTheDocument();
    expect(within(dialog).getByText("req-abc123")).toBeInTheDocument();
    expect(within(dialog).getByText("demo-attack-001")).toBeInTheDocument();
    expect(within(dialog).getByText("invoice.pdf")).toBeInTheDocument();
    expect(within(dialog).getByText("Untrusted content attempted to access a private or sensitive file.")).toBeInTheDocument();
    expect(within(dialog).getByText("Agent Prompt")).toBeInTheDocument();
    expect(within(dialog).queryByText("password=should-not-render")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Redacted")).toBeInTheDocument();
    expect(within(dialog).queryByText("CONFIDENTIAL - INTERNAL ONLY")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Security decision timeline")).toBeInTheDocument();
  });

  it("displays the agent prompt in the audit log table and detail drawer", async () => {
    renderAudit();
    const promptInstances = await screen.findAllByText("Summarize financial-report.pdf");
    expect(promptInstances.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("row", { name: /send_email BYPASS/i }));
    const dialog = await screen.findByRole("dialog", { name: "Event Details" });
    expect(within(dialog).getByText("Agent Prompt")).toBeInTheDocument();
    expect(within(dialog).getByText("Summarize financial-report.pdf")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
  });

  it("copies the request ID", async () => {
    renderAudit();
    fireEvent.click(await screen.findByRole("row", { name: /send_email BLOCK/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("req-abc123");
    });
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("filters by session when the session ID is clicked", async () => {
    renderAudit();
    fireEvent.click(await screen.findByRole("row", { name: /send_email BLOCK/i }));
    fireEvent.click(screen.getByRole("button", { name: "demo-attack-001" }));
    await waitFor(() => {
      expect(queryOf(vi.mocked(getAuditEvents).mock.calls.at(-1)?.[0]).session_id).toBe("demo-attack-001");
    });
  });

  it("displays BLOCK, BYPASS, and APPROVAL REQUIRED from real event payloads", async () => {
    render(<AuditLogsView pollIntervalMs={0} pageSize={10} />);
    expect((await screen.findAllByText("BLOCKED")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("BYPASS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("APPROVAL REQUIRED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OFF").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ON").length).toBeGreaterThan(0);
  });

  it("polls for new events without creating fake ones", async () => {
    let includeNew = false;
    vi.mocked(getAuditEvents).mockImplementation(async () => {
      if (!includeNew) {
        return [EVENTS[0]];
      }
      return [event({ id: "evt-new", tool_name: "read_file", action: "read_file" }), EVENTS[0]];
    });
    render(<AuditLogsView pollIntervalMs={40} pageSize={10} />);
    expect(await screen.findByText("Auto-refresh ON")).toBeInTheDocument();
    expect(await screen.findAllByText("send_email")).toBeTruthy();
    expect(screen.queryByText("read_file")).not.toBeInTheDocument();
    includeNew = true;
    expect((await screen.findAllByText("read_file", {}, { timeout: 2000 })).length).toBeGreaterThan(0);
    expect(await screen.findByText(/1 new event/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText("synthetic-event")).not.toBeInTheDocument();
  });
});
