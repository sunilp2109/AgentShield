import type { SecurityEvent } from "@/types";

export const AUDIT_PAGE_SIZE = 25;
export const AUDIT_POLL_INTERVAL_MS = 5000;
export const AUDIT_SEARCH_DEBOUNCE_MS = 300;

export type AuditEventQuery = {
  decision?: string;
  risk_level?: string;
  injection_detected?: boolean;
  shield_enabled?: boolean;
  session_id?: string;
  source_type?: string;
  limit?: number;
  offset?: number;
};

export type AuditFilters = {
  decision: string;
  riskLevel: string;
  injection: "ALL" | "DETECTED" | "NOT_DETECTED";
  shield: "ALL" | "ON" | "OFF";
  sourceType: string;
  sessionId: string;
};

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  decision: "",
  riskLevel: "",
  injection: "ALL",
  shield: "ALL",
  sourceType: "",
  sessionId: "",
};

export const DECISION_FILTERS = [
  { id: "", label: "All" },
  { id: "ALLOW", label: "Allow" },
  { id: "APPROVAL_REQUIRED", label: "Approval Required" },
  { id: "BLOCK", label: "Blocked" },
  { id: "BYPASS", label: "Bypass" },
] as const;

export const RISK_FILTERS = [
  { id: "", label: "All" },
  { id: "LOW", label: "Low" },
  { id: "MEDIUM", label: "Medium" },
  { id: "HIGH", label: "High" },
  { id: "CRITICAL", label: "Critical" },
] as const;

export const INJECTION_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "DETECTED", label: "Detected" },
  { id: "NOT_DETECTED", label: "Not Detected" },
] as const;

export const SHIELD_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "ON", label: "ON" },
  { id: "OFF", label: "OFF" },
] as const;

export const SOURCE_FILTERS = [
  { id: "", label: "All" },
  { id: "USER_REQUEST", label: "User" },
  { id: "DOCUMENT", label: "Document" },
  { id: "WEB_PAGE", label: "Web" },
  { id: "EMAIL", label: "Email" },
  { id: "TOOL_OUTPUT", label: "Tool Output" },
] as const;

const SECRET_RE =
  /password|passwd|api[_-]?key|secret|token|bearer|authorization|sk_live|sk_test|ghp_|xox[baprs]-|confidential file contents/i;

export function toAuditQuery(filters: AuditFilters, offset: number, limit = AUDIT_PAGE_SIZE): AuditEventQuery {
  const query: AuditEventQuery = { limit, offset };
  if (filters.decision) {
    query.decision = filters.decision;
  }
  if (filters.riskLevel) {
    query.risk_level = filters.riskLevel;
  }
  if (filters.injection === "DETECTED") {
    query.injection_detected = true;
  }
  if (filters.injection === "NOT_DETECTED") {
    query.injection_detected = false;
  }
  if (filters.shield === "ON") {
    query.shield_enabled = true;
  }
  if (filters.shield === "OFF") {
    query.shield_enabled = false;
  }
  if (filters.sourceType) {
    query.source_type = filters.sourceType;
  }
  if (filters.sessionId.trim()) {
    query.session_id = filters.sessionId.trim();
  }
  return query;
}

export function buildAuditEventsPath(query: AuditEventQuery): string {
  const params = new URLSearchParams();
  if (query.decision) params.set("decision", query.decision);
  if (query.risk_level) params.set("risk_level", query.risk_level);
  if (typeof query.injection_detected === "boolean") {
    params.set("injection_detected", String(query.injection_detected));
  }
  if (typeof query.shield_enabled === "boolean") {
    params.set("shield_enabled", String(query.shield_enabled));
  }
  if (query.session_id) params.set("session_id", query.session_id);
  if (query.source_type) params.set("source_type", query.source_type);
  params.set("limit", String(query.limit ?? AUDIT_PAGE_SIZE));
  params.set("offset", String(query.offset ?? 0));
  return `/api/v1/audit/events?${params.toString()}`;
}

export function searchEvents(events: SecurityEvent[], query: string): SecurityEvent[] {
  const term = query.trim().toLowerCase();
  if (!term) {
    return events;
  }
  return events.filter((event) => {
    const haystack = [
      event.tool_name,
      event.action,
      event.source_name,
      event.target_resource,
      event.request_id,
      event.session_id,
      event.user_intent,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

export function looksSensitive(value: string): boolean {
  return SECRET_RE.test(value);
}

export function safeDisplay(value: string | number | boolean | null | undefined): string {
  if (value == null || value === "") {
    return "Not recorded";
  }
  const text = String(value);
  if (looksSensitive(text)) {
    return "Redacted";
  }
  return text;
}

export function decisionLabel(decision: string | null | undefined): string {
  if (!decision) {
    return "Not recorded";
  }
  if (decision === "BLOCK") {
    return "BLOCKED";
  }
  if (decision === "APPROVAL_REQUIRED") {
    return "APPROVAL REQUIRED";
  }
  return decision;
}

export function executionLabel(status: string | null | undefined): string {
  if (!status) {
    return "Not recorded";
  }
  if (status === "PENDING_APPROVAL" || status === "PENDING") {
    return "PENDING";
  }
  if (status === "BYPASSED") {
    return "EXECUTED";
  }
  if (status === "REJECTED") {
    return "NOT EXECUTED";
  }
  if (status === "FAILED") {
    return "ERROR";
  }
  if (status === "NOT_EXECUTED") {
    return "NOT EXECUTED";
  }
  return status;
}

export function formatAuditClock(value: string): string {
  const match = value.match(/T(\d{2}:\d{2}:\d{2})/);
  if (match) {
    return match[1];
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "Not recorded";
  }
  return new Date(parsed).toISOString().slice(11, 19);
}

export function countNewEventIds(previous: SecurityEvent[] | null, incoming: SecurityEvent[]): string[] {
  if (!previous || previous.length === 0) {
    return [];
  }
  const known = new Set(previous.map((event) => event.id));
  return incoming.filter((event) => !known.has(event.id)).map((event) => event.id);
}
