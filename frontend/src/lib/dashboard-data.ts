import type { AuditStats, SecurityDecision, SecurityEvent } from "@/types";

import type { ActivityFilter } from "@/lib/dashboard";

export const DECISION_CLASSNAMES: Record<SecurityDecision, string> = {
  ALLOW: "border-success/30 bg-success/10 text-success",
  APPROVAL_REQUIRED: "border-warning/30 bg-warning/10 text-warning",
  BLOCK: "border-destructive/30 bg-destructive/10 text-destructive",
  BYPASS: "border-bypass/30 bg-muted text-bypass",
};

export const RISK_CLASSNAMES: Record<string, string> = {
  LOW: "bg-success",
  MEDIUM: "bg-warning",
  HIGH: "bg-destructive/80",
  CRITICAL: "bg-destructive",
};

export function decisionClassName(decision: string): string {
  return DECISION_CLASSNAMES[decision as SecurityDecision] ?? "border-border bg-muted text-muted-foreground";
}

export function mergeSecurityEvents(
  previous: SecurityEvent[] | null,
  incoming: SecurityEvent[] | null,
  limit = 20,
): { events: SecurityEvent[] | null; newIds: string[] } {
  if (!incoming) {
    return { events: previous, newIds: [] };
  }
  const previousIds = new Set((previous ?? []).map((event) => event.id));
  const byId = new Map<string, SecurityEvent>();
  for (const event of previous ?? []) {
    byId.set(event.id, event);
  }
  const newIds: string[] = [];
  for (const event of incoming) {
    if (!previousIds.has(event.id)) {
      newIds.push(event.id);
    }
    byId.set(event.id, event);
  }
  const events = [...byId.values()].sort((left, right) => {
    const delta = Date.parse(right.timestamp) - Date.parse(left.timestamp);
    return Number.isNaN(delta) ? 0 : delta;
  });
  return { events: events.slice(0, limit), newIds };
}

export function filterActivityEvents(events: SecurityEvent[], filter: ActivityFilter): SecurityEvent[] {
  if (filter === "ALL") {
    return events;
  }
  return events.filter((event) => event.firewall_decision === filter);
}

export function toolActivityCounts(events: SecurityEvent[]): { tool: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.tool_name === "shield") {
      continue;
    }
    counts.set(event.tool_name, (counts.get(event.tool_name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((left, right) => right.count - left.count || left.tool.localeCompare(right.tool));
}

export type RiskBucket = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function riskDistribution(
  stats: AuditStats | null,
  events: SecurityEvent[] | null,
): Record<RiskBucket, number> {
  if (
    stats &&
    typeof stats.risk_low === "number" &&
    typeof stats.risk_medium === "number" &&
    typeof stats.risk_high === "number" &&
    typeof stats.risk_critical === "number"
  ) {
    return {
      LOW: stats.risk_low,
      MEDIUM: stats.risk_medium,
      HIGH: stats.risk_high,
      CRITICAL: stats.risk_critical,
    };
  }
  const derived: Record<RiskBucket, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const event of events ?? []) {
    const level = event.risk_level;
    if (level === "LOW" || level === "MEDIUM" || level === "HIGH" || level === "CRITICAL") {
      derived[level] += 1;
    }
  }
  return derived;
}
