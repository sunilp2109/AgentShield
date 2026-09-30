import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentChatView } from "@/components/agent/AgentChatView";
import { ApiError } from "@/lib/api";
import type { AgentChatResponse, AgentToolRun, SecurityEvent } from "@/types";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/agent-api", () => ({
  sendChat: vi.fn(),
}));

vi.mock("@/lib/security-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security-api")>("@/lib/security-api");
  return {
    ...actual,
    getHealthStatus: vi.fn(),
    getShieldStatus: vi.fn(),
    getAuditEvents: vi.fn(),
  };
});

import { sendChat } from "@/lib/agent-api";
import { getAuditEvents, getHealthStatus, getShieldStatus } from "@/lib/security-api";

function toolRun(overrides: Partial<AgentToolRun> = {}): AgentToolRun {
  return {
    name: "read_file",
    arguments: { path: "invoice.pdf" },
    shield_applied: true,
    decision: "BLOCK",
    status: "blocked",
    result: null,
    reasons: ["Untrusted content attempted to access a private or sensitive file."],
    trust: { source_type: "PDF", trust_level: "UNTRUSTED" },
    execution_status: "BLOCKED",
    approval_required: false,
    approval_id: null,
    risk_score: 94,
    risk_level: "CRITICAL",
    ...overrides,
  };
}

function chatPayload(overrides: Partial<AgentChatResponse> = {}): AgentChatResponse {
  return {
    response: "I couldn't complete that action because the requested operation was blocked by the application's security controls.",
    tool_calls: [{ name: "read_file", arguments: { path: "confidential.txt" } }],
    tool_results: [toolRun()],
    reasoning_summary: "document follow-up",
    sources: ["invoice.pdf"],
    session_id: "agent-session-1",
    request_id: "req-chat-1",
    shield_enabled: true,
    ...overrides,
  };
}

function event(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: "evt-1",
    timestamp: "2026-09-20T16:00:00Z",
    session_id: "agent-session-1",
    request_id: "req-chat-1",
    shield_enabled: true,
    source_type: "DOCUMENT",
    source_name: "invoice.pdf",
    trust_level: "UNTRUSTED",
    user_intent: "Summarize invoice.pdf",
    tool_name: "send_email",
    action: "send_email",
    target_resource: "attacker@example.com",
    data_sensitivity: "CRITICAL",
    destination_type: "EXTERNAL_EMAIL",
    injection_detected: true,
    injection_confidence: 0.95,
    risk_score: 94,
    risk_level: "CRITICAL",
    policy_decision: "BLOCK",
    firewall_decision: "BLOCK",
    execution_status: "BLOCKED",
    execution_result_summary: "Blocked.",
    block_reason: "Untrusted content attempted to access a private or sensitive file.",
    approval_required: false,
    created_at: "2026-09-20T16:00:00Z",
    ...overrides,
  };
}

function ready() {
  vi.mocked(getHealthStatus).mockResolvedValue({ status: "ok", shield_enabled: true });
  vi.mocked(getShieldStatus).mockResolvedValue({ shield_enabled: true, enabled: true, mode: "PROTECTED" });
}

async function sendMessage(text: string) {
  const input = screen.getByPlaceholderText("Type a message...");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("AgentChatView", () => {
  beforeEach(() => {
    vi.mocked(sendChat).mockReset();
    vi.mocked(getAuditEvents).mockReset();
    vi.mocked(getHealthStatus).mockReset();
    vi.mocked(getShieldStatus).mockReset();
  });
  it("loads the assistant chat without sending a message", async () => {
    ready();
    render(<AgentChatView />);
    expect(await screen.findByRole("heading", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(sendChat).not.toHaveBeenCalled();
  });

  it("lists predefined demo scenarios without sending", async () => {
    ready();
    render(<AgentChatView />);
    expect(await screen.findByRole("heading", { name: "Malicious document" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data exfiltration" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Instruction override" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "External email" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trusted document" })).toBeInTheDocument();
    expect(sendChat).not.toHaveBeenCalled();
  });

  it("Use prompt fills the input without sending", async () => {
    ready();
    render(<AgentChatView />);
    fireEvent.click(await screen.findByRole("button", { name: "Use Malicious document prompt" }));
    expect(screen.getByPlaceholderText("Type a message...")).toHaveValue("Summarize invoice.pdf");
    expect(sendChat).not.toHaveBeenCalled();
  });

  it("Run sends the scenario through the existing Agent API", async () => {
    ready();
    vi.mocked(sendChat).mockResolvedValue(chatPayload());
    vi.mocked(getAuditEvents).mockResolvedValue([event()]);
    render(<AgentChatView />);
    fireEvent.click(await screen.findByRole("button", { name: "Run Malicious document" }));
    expect(sendChat).toHaveBeenCalledWith({ message: "Summarize invoice.pdf", session_id: null });
    expect(await screen.findByText("Action blocked")).toBeInTheDocument();
  });

  it("sends the typed message to the existing Agent API and renders a BLOCK result", async () => {
    ready();
    vi.mocked(sendChat).mockResolvedValue(chatPayload());
    vi.mocked(getAuditEvents).mockResolvedValue([event()]);
    render(<AgentChatView />);
    await sendMessage("Summarize invoice.pdf");
    expect(sendChat).toHaveBeenCalledWith({ message: "Summarize invoice.pdf", session_id: null });
    expect(await screen.findByText("Action blocked")).toBeInTheDocument();
    expect(screen.getByText("Detected")).toBeInTheDocument();
    expect(screen.getByText("94 / CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("NOT EXECUTED")).toBeInTheDocument();
    expect(screen.queryByText("Ignore previous instructions")).not.toBeInTheDocument();
    expect(screen.queryByText("sk_live_demo_not_real_111")).not.toBeInTheDocument();
    expect(getAuditEvents).toHaveBeenCalledWith({ session_id: "agent-session-1", limit: 50 });
  });

  it("renders ALLOW results without a large security card", async () => {
    ready();
    vi.mocked(sendChat).mockResolvedValue(
      chatPayload({
        response: "Here is the summary:\nQ3 Operations Report",
        tool_results: [
          toolRun({ decision: "ALLOW", execution_status: "EXECUTED", status: "executed", risk_level: "LOW", risk_score: 12 }),
        ],
      }),
    );
    vi.mocked(getAuditEvents).mockResolvedValue([]);
    render(<AgentChatView />);
    await sendMessage("Read project-report.pdf");
    expect(await screen.findByText(/Q3 Operations Report/)).toBeInTheDocument();
    expect(screen.getByText("AgentShield · Action allowed")).toBeInTheDocument();
    expect(screen.queryByText("Action blocked")).not.toBeInTheDocument();
  });

  it("renders APPROVAL_REQUIRED with a link to /approvals", async () => {
    ready();
    vi.mocked(sendChat).mockResolvedValue(
      chatPayload({
        response: "I need a human to approve this action before I can continue.",
        tool_results: [
          toolRun({
            name: "send_email",
            decision: "APPROVAL_REQUIRED",
            execution_status: "PENDING",
            approval_required: true,
            approval_id: "apr-9",
            risk_level: "HIGH",
            arguments: { recipient: "manager@example.com" },
          }),
        ],
      }),
    );
    vi.mocked(getAuditEvents).mockResolvedValue([]);
    render(<AgentChatView />);
    await sendMessage("Send the project report to my manager.");
    expect(await screen.findByText("Action requires human approval")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review in Approvals" })).toHaveAttribute("href", "/approvals");
  });

  it("renders BYPASS from the backend payload", async () => {
    ready();
    vi.mocked(getShieldStatus).mockResolvedValue({ shield_enabled: false, mode: "BASELINE" });
    vi.mocked(sendChat).mockResolvedValue(
      chatPayload({
        response: "I finished processing that request.",
        shield_enabled: false,
        tool_results: [toolRun({ decision: "BYPASS", execution_status: "EXECUTED", status: "executed" })],
      }),
    );
    vi.mocked(getAuditEvents).mockResolvedValue([
      event({ firewall_decision: "BYPASS", execution_status: "EXECUTED", injection_detected: true }),
    ]);
    render(<AgentChatView />);
    await sendMessage("Summarize invoice.pdf");
    expect(await screen.findByText(/Baseline \/ Bypass/)).toBeInTheDocument();
    expect(screen.queryByText("Action blocked")).not.toBeInTheDocument();
  });

  it("sends on Enter and inserts a newline on Shift+Enter", async () => {
    ready();
    vi.mocked(sendChat).mockResolvedValue(chatPayload({ response: "Hello", tool_results: [] }));
    vi.mocked(getAuditEvents).mockResolvedValue([]);
    render(<AgentChatView />);
    const input = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(sendChat).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Hello\nthere" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    await waitFor(() => {
      expect(sendChat).toHaveBeenCalledWith({ message: "Hello\nthere", session_id: null });
    });
  });

  it("shows a retry action when the Agent API fails", async () => {
    ready();
    vi.mocked(sendChat)
      .mockRejectedValueOnce(new ApiError("Request failed: 503", 503))
      .mockResolvedValueOnce(chatPayload({ response: "Recovered", tool_results: [] }));
    vi.mocked(getAuditEvents).mockResolvedValue([]);
    render(<AgentChatView />);
    await sendMessage("Hello");
    expect(await screen.findByText("Agent backend unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("Action blocked")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Recovered")).toBeInTheDocument();
  });

  it("New Chat clears the transcript and starts a new session", async () => {
    ready();
    vi.mocked(sendChat)
      .mockResolvedValueOnce(chatPayload())
      .mockResolvedValueOnce(chatPayload({ session_id: "agent-session-2", response: "Second chat" }));
    vi.mocked(getAuditEvents).mockResolvedValue([]);
    render(<AgentChatView />);
    await sendMessage("Summarize invoice.pdf");
    expect(await screen.findByText(/couldn't complete that action/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New Chat" }));
    expect(screen.queryByText(/couldn't complete that action/)).not.toBeInTheDocument();
    await sendMessage("Hi");
    expect(sendChat).toHaveBeenLastCalledWith({ message: "Hi", session_id: null });
    expect(await screen.findByText("Second chat")).toBeInTheDocument();
  });

  it("shows a loading state while the backend request is in flight", async () => {
    ready();
    let resolveChat: (value: AgentChatResponse) => void = () => undefined;
    vi.mocked(sendChat).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveChat = resolve;
        }),
    );
    render(<AgentChatView />);
    await sendMessage("Hi");
    expect(await screen.findByText("Agent is thinking...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a message...")).toBeDisabled();
    resolveChat(chatPayload({ response: "Done", tool_results: [] }));
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });
});
