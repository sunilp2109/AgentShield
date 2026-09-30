import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecurityConsoleProvider } from "@/components/security/SecurityConsoleProvider";
import { ShieldToggle } from "@/components/security/ShieldToggle";
import {
  getAuditEvents,
  getAuditStats,
  getHealthStatus,
  getPendingApprovals,
  getShieldStatus,
  setShieldEnabled,
} from "@/lib/security-api";
import type { AuditStats } from "@/types";

vi.mock("@/lib/security-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security-api")>("@/lib/security-api");
  return {
    ...actual,
    getHealthStatus: vi.fn(),
    getShieldStatus: vi.fn(),
    setShieldEnabled: vi.fn(),
    getAuditStats: vi.fn(),
    getAuditEvents: vi.fn(),
    getPendingApprovals: vi.fn(),
  };
});

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
};

function mockConsole(enabled: boolean | "hang" | "fail" = true) {
  vi.mocked(getHealthStatus).mockResolvedValue({ status: "ok", shield_enabled: enabled === true });
  vi.mocked(getAuditStats).mockResolvedValue(EMPTY_STATS);
  vi.mocked(getAuditEvents).mockResolvedValue([]);
  vi.mocked(getPendingApprovals).mockResolvedValue([]);

  if (enabled === "hang") {
    vi.mocked(getShieldStatus).mockImplementation(() => new Promise(() => undefined));
    return;
  }
  if (enabled === "fail") {
    vi.mocked(getHealthStatus).mockRejectedValue(new Error("offline"));
    vi.mocked(getShieldStatus).mockRejectedValue(new Error("offline"));
    vi.mocked(getAuditStats).mockRejectedValue(new Error("offline"));
    vi.mocked(getAuditEvents).mockRejectedValue(new Error("offline"));
    vi.mocked(getPendingApprovals).mockRejectedValue(new Error("offline"));
    return;
  }
  vi.mocked(getShieldStatus).mockResolvedValue({
    shield_enabled: enabled,
    enabled,
    mode: enabled ? "PROTECTED" : "BASELINE",
  });
}

function renderToggle() {
  return render(
    <SecurityConsoleProvider pollIntervalMs={0}>
      <ShieldToggle />
    </SecurityConsoleProvider>,
  );
}

describe("ShieldToggle", () => {
  beforeEach(() => {
    vi.mocked(setShieldEnabled).mockReset();
    vi.mocked(getShieldStatus).mockReset();
    vi.mocked(getHealthStatus).mockReset();
    vi.mocked(getAuditStats).mockReset();
    vi.mocked(getAuditEvents).mockReset();
    vi.mocked(getPendingApprovals).mockReset();
  });

  it("shows a loading state until the backend responds", () => {
    mockConsole("hang");
    renderToggle();
    expect(screen.getByText("LOADING")).toBeInTheDocument();
    expect(screen.queryByText("Shield Active")).not.toBeInTheDocument();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable AgentShield" })).toBeDisabled();
  });

  it("displays ON when the backend reports Shield enabled", async () => {
    mockConsole(true);
    renderToggle();
    expect(await screen.findByText("Shield Active")).toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("Protection is enabled")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Disable AgentShield" })).toHaveAttribute("aria-checked", "true");
  });

  it("displays OFF when the backend reports Shield disabled", async () => {
    mockConsole(false);
    renderToggle();
    expect(await screen.findByText("Shield Disabled")).toBeInTheDocument();
    expect(screen.getByText("OFF")).toBeInTheDocument();
    expect(screen.getByText("Protection is bypassed")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable AgentShield" })).toHaveAttribute("aria-checked", "false");
  });

  it("shows a backend failure state without claiming protection", async () => {
    mockConsole("fail");
    renderToggle();
    expect(await screen.findByText("Shield status unavailable")).toBeInTheDocument();
    expect(screen.getByText("AgentShield backend unavailable")).toBeInTheDocument();
    expect(screen.getByText("Protection status cannot be verified.")).toBeInTheDocument();
    expect(screen.queryByText("Shield Active")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("requires confirmation before turning Shield OFF", async () => {
    mockConsole(true);
    vi.mocked(setShieldEnabled).mockResolvedValue({
      shield_enabled: false,
      enabled: false,
      mode: "BASELINE",
    });
    renderToggle();
    fireEvent.click(await screen.findByRole("switch", { name: "Disable AgentShield" }));
    expect(screen.getByRole("dialog", { name: "Disable AgentShield?" })).toBeInTheDocument();
    expect(setShieldEnabled).not.toHaveBeenCalled();
  });

  it("leaves state unchanged when confirmation is cancelled", async () => {
    mockConsole(true);
    renderToggle();
    fireEvent.click(await screen.findByRole("switch", { name: "Disable AgentShield" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setShieldEnabled).not.toHaveBeenCalled();
    expect(screen.getByText("Shield Active")).toBeInTheDocument();
  });

  it("calls the backend after confirming Shield OFF", async () => {
    mockConsole(true);
    vi.mocked(setShieldEnabled).mockResolvedValue({
      shield_enabled: false,
      enabled: false,
      mode: "BASELINE",
    });
    renderToggle();
    fireEvent.click(await screen.findByRole("switch", { name: "Disable AgentShield" }));
    fireEvent.click(screen.getByRole("button", { name: "Disable Shield" }));
    await waitFor(() => {
      expect(setShieldEnabled).toHaveBeenCalledWith(false);
    });
    expect(await screen.findByText("Shield Disabled")).toBeInTheDocument();
    expect(screen.getByText("Shield is now OFF.")).toBeInTheDocument();
  });

  it("turns Shield ON without confirmation", async () => {
    mockConsole(false);
    vi.mocked(setShieldEnabled).mockResolvedValue({
      shield_enabled: true,
      enabled: true,
      mode: "PROTECTED",
    });
    renderToggle();
    fireEvent.click(await screen.findByRole("switch", { name: "Enable AgentShield" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(setShieldEnabled).toHaveBeenCalledWith(true);
    });
    expect(await screen.findByText("Shield Active")).toBeInTheDocument();
  });

  it("restores the previous state when the toggle request fails", async () => {
    mockConsole(true);
    vi.mocked(setShieldEnabled).mockRejectedValue(new Error("offline"));
    renderToggle();
    fireEvent.click(await screen.findByRole("switch", { name: "Disable AgentShield" }));
    fireEvent.click(screen.getByRole("button", { name: "Disable Shield" }));
    expect(await screen.findByText("Unable to change Shield state.")).toBeInTheDocument();
    expect(screen.getByText("Shield Active")).toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
  });

  it("disables the switch while a toggle is in progress", async () => {
    mockConsole(false);
    vi.mocked(setShieldEnabled).mockImplementation(() => new Promise(() => undefined));
    renderToggle();
    const toggle = await screen.findByRole("switch", { name: "Enable AgentShield" });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeDisabled();
    });
    expect(screen.getByText("UPDATING")).toBeInTheDocument();
  });

  it("exposes accessible labels for the switch", async () => {
    mockConsole(true);
    renderToggle();
    const toggle = await screen.findByRole("switch", { name: "Disable AgentShield" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAccessibleName("Disable AgentShield");
  });
});
