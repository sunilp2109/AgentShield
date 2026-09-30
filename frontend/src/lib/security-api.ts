import type {
  ApprovalRequest,
  AttackRunResult,
  AttackScenario,
  AuditStats,
  HealthStatus,
  SecurityEvent,
  ShieldStatus,
} from "@/types";

import { api } from "@/lib/api";
import { AUDIT_PAGE_SIZE, buildAuditEventsPath, type AuditEventQuery } from "@/lib/audit";

export function getShieldStatus() {
  return api.get<ShieldStatus>("/api/v1/security/status");
}

export function setShieldEnabled(enabled: boolean) {
  return api.post<ShieldStatus>("/api/v1/security/toggle", { enabled });
}

export function readShieldEnabled(status: ShieldStatus): boolean {
  if (typeof status.shield_enabled === "boolean") {
    return status.shield_enabled;
  }
  if (typeof status.enabled === "boolean") {
    return status.enabled;
  }
  throw new Error("Invalid shield status");
}

export function getHealthStatus() {
  return api.get<HealthStatus>("/health");
}

export function getAuditStats() {
  return api.get<AuditStats>("/api/v1/audit/stats");
}

export function getAuditEvents(limitOrQuery: number | AuditEventQuery = 20) {
  if (typeof limitOrQuery === "number") {
    return api.get<SecurityEvent[]>(`/api/v1/audit/events?limit=${limitOrQuery}`);
  }
  return api.get<SecurityEvent[]>(buildAuditEventsPath({ limit: AUDIT_PAGE_SIZE, offset: 0, ...limitOrQuery }));
}

export function getAuditEvent(eventId: string) {
  return api.get<SecurityEvent>(`/api/v1/audit/events/${encodeURIComponent(eventId)}`);
}

export function getApprovals(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return api.get<ApprovalRequest[]>(`/api/v1/approvals${query}`);
}

export function getPendingApprovals() {
  return getApprovals("PENDING");
}

export function getApproval(approvalId: string) {
  return api.get<ApprovalRequest>(`/api/v1/approvals/${encodeURIComponent(approvalId)}`);
}

export function approveApproval(approvalId: string, payload?: { decided_by?: string; reason?: string }) {
  return api.post<ApprovalRequest>(
    `/api/v1/approvals/${encodeURIComponent(approvalId)}/approve`,
    payload ?? {},
  );
}

export function rejectApproval(approvalId: string, payload?: { decided_by?: string; reason?: string }) {
  return api.post<ApprovalRequest>(
    `/api/v1/approvals/${encodeURIComponent(approvalId)}/reject`,
    payload ?? {},
  );
}

export function getAttackScenarios() {
  return api.get<AttackScenario[]>("/api/v1/attack-lab/scenarios");
}

export function runAttack(scenarioId: string) {
  return api.post<AttackRunResult>("/api/v1/attack-lab/run", { scenario_id: scenarioId });
}
