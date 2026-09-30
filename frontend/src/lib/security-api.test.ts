import { describe, expect, it, vi } from "vitest";

import { getApprovals, getApproval, approveApproval, rejectApproval, getAttackScenarios, getAuditEvents, getShieldStatus, readShieldEnabled, runAttack, setShieldEnabled } from "@/lib/security-api";

describe("security-api shield helpers", () => {
  it("loads shield status from the existing security endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ shield_enabled: true, enabled: true, mode: "PROTECTED" }),
      }),
    );
    await expect(getShieldStatus()).resolves.toEqual({
      shield_enabled: true,
      enabled: true,
      mode: "PROTECTED",
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/security/status",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("posts shield changes to the existing toggle endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ shield_enabled: false, enabled: false, mode: "BASELINE" }),
      }),
    );
    await expect(setShieldEnabled(false)).resolves.toEqual({
      shield_enabled: false,
      enabled: false,
      mode: "BASELINE",
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/security/toggle",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ enabled: false }),
      }),
    );
  });

  it("reads shield_enabled from the backend payload", () => {
    expect(readShieldEnabled({ shield_enabled: true })).toBe(true);
    expect(readShieldEnabled({ shield_enabled: false, enabled: true })).toBe(false);
  });

  it("loads attack lab scenarios from the backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ id: "malicious-pdf", name: "Malicious Document Injection", payload: "x" }],
      }),
    );
    await expect(getAttackScenarios()).resolves.toEqual([
      { id: "malicious-pdf", name: "Malicious Document Injection", payload: "x" },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/attack-lab/scenarios",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("runs an attack by scenario id only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ scenario_id: "malicious-pdf", firewall_decision: "BLOCK" }),
      }),
    );
    await expect(runAttack("malicious-pdf")).resolves.toEqual({
      scenario_id: "malicious-pdf",
      firewall_decision: "BLOCK",
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/attack-lab/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ scenario_id: "malicious-pdf" }),
      }),
    );
  });

  it("loads audit events with backend-supported filters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
    await getAuditEvents({
      decision: "BLOCK",
      risk_level: "CRITICAL",
      injection_detected: true,
      shield_enabled: true,
      session_id: "demo-attack-001",
      source_type: "DOCUMENT",
      limit: 25,
      offset: 0,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:8000/api/v1/audit/events?"),
      expect.objectContaining({ method: "GET" }),
    );
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain("decision=BLOCK");
    expect(url).toContain("risk_level=CRITICAL");
    expect(url).toContain("injection_detected=true");
    expect(url).toContain("shield_enabled=true");
    expect(url).toContain("session_id=demo-attack-001");
    expect(url).toContain("source_type=DOCUMENT");
    expect(url).toContain("limit=25");
    expect(url).toContain("offset=0");
  });

  it("loads and reviews approvals through the existing Module 11 API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
    await getApprovals("PENDING");
    await getApproval("apr-1");
    await approveApproval("apr-1", {});
    await rejectApproval("apr-1", { reason: "Not needed" });
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toBe("http://localhost:8000/api/v1/approvals?status=PENDING");
    expect(urls[1]).toBe("http://localhost:8000/api/v1/approvals/apr-1");
    expect(urls[2]).toBe("http://localhost:8000/api/v1/approvals/apr-1/approve");
    expect(urls[3]).toBe("http://localhost:8000/api/v1/approvals/apr-1/reject");
    expect(vi.mocked(fetch).mock.calls[2][1]).toEqual(
      expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
    );
    expect(vi.mocked(fetch).mock.calls[3][1]).toEqual(
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Not needed" }) }),
    );
  });
});
