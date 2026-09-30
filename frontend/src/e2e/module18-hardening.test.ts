import { describe, expect, it, vi } from "vitest";

import { APPROVAL_POLL_INTERVAL_MS } from "@/lib/approvals";
import { AUDIT_POLL_INTERVAL_MS } from "@/lib/audit";
import { DASHBOARD_POLL_INTERVAL_MS } from "@/lib/dashboard";
import {
  approveApproval,
  getApprovals,
  getAuditEvents,
  getAuditStats,
  getPendingApprovals,
  getShieldStatus,
  rejectApproval,
  runAttack,
} from "@/lib/security-api";

describe("Module 18 polling and API contract", () => {
  it("does not poll more often than every five seconds", () => {
    expect(DASHBOARD_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
    expect(AUDIT_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
    expect(APPROVAL_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
  });

  it("reuses the real Module 10/11/13/15 endpoints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
    await getShieldStatus();
    await getAuditStats();
    await getAuditEvents(20);
    await getPendingApprovals();
    await getApprovals();
    await runAttack("malicious-pdf");
    await approveApproval("apr-1", {});
    await rejectApproval("apr-1", { reason: "no" });
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls).toContain("http://localhost:8000/api/v1/security/status");
    expect(urls.some((url) => url.includes("/api/v1/audit/stats"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v1/audit/events"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v1/approvals?status=PENDING"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v1/attack-lab/run"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/api/v1/approvals/apr-1/approve"))).toBe(true);
  });
});
