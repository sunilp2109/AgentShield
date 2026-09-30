"use client";

import {
  DecisionBadge,
  ExecutionBadge,
  InjectionBadge,
  RiskBadge,
  ShieldStateBadge,
} from "@/components/audit/AuditBadges";
import { formatAuditClock } from "@/lib/audit";
import { formatSourceLabel } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { SecurityEvent } from "@/types";

type AuditEventTableProps = {
  events: SecurityEvent[];
  selectedId?: string | null;
  newEventIds?: string[];
  loading?: boolean;
  onSelect: (event: SecurityEvent) => void;
};

export function AuditEventTable({
  events,
  selectedId,
  newEventIds = [],
  loading = false,
  onSelect,
}: AuditEventTableProps) {
  if (loading) {
    return (
      <div className="space-y-2" data-testid="audit-table-skeleton" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2">Time</th>
              <th className="hidden px-3 py-2 lg:table-cell">Source</th>
              <th className="px-3 py-2">Tool / Action</th>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Decision</th>
              <th className="px-3 py-2">Execution</th>
              <th className="hidden px-3 py-2 lg:table-cell">Injection</th>
              <th className="hidden px-3 py-2 lg:table-cell">Shield</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                tabIndex={0}
                aria-label={`Open event ${event.tool_name} ${event.firewall_decision}`}
                onClick={() => onSelect(event)}
                onKeyDown={(keyboard) => {
                  if (keyboard.key === "Enter" || keyboard.key === " ") {
                    keyboard.preventDefault();
                    onSelect(event);
                  }
                }}
                className={cn(
                  "cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selectedId === event.id && "bg-primary/5",
                  newEventIds.includes(event.id) && "bg-primary/10",
                )}
              >
                <td className="px-3 py-2 font-mono text-xs">{formatAuditClock(event.timestamp)}</td>
                <td className="hidden px-3 py-2 lg:table-cell">{formatSourceLabel(event.source_type)}</td>
                <td className="px-3 py-2 font-medium">{event.tool_name}</td>
                <td className="px-3 py-2">
                  <RiskBadge score={event.risk_score} level={event.risk_level} />
                </td>
                <td className="px-3 py-2">
                  <DecisionBadge decision={event.firewall_decision} />
                </td>
                <td className="px-3 py-2">
                  <ExecutionBadge status={event.execution_status} />
                </td>
                <td className="hidden px-3 py-2 lg:table-cell">
                  <InjectionBadge detected={event.injection_detected} />
                </td>
                <td className="hidden px-3 py-2 lg:table-cell">
                  <ShieldStateBadge enabled={event.shield_enabled} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {events.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => onSelect(event)}
              className={cn(
                "w-full rounded-xl border border-border bg-background/40 p-3 text-left",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                selectedId === event.id && "border-primary/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{event.tool_name}</p>
                <DecisionBadge decision={event.firewall_decision} />
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{formatAuditClock(event.timestamp)}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <RiskBadge score={event.risk_score} level={event.risk_level} />
                <ExecutionBadge status={event.execution_status} />
                <InjectionBadge detected={event.injection_detected} />
                <ShieldStateBadge enabled={event.shield_enabled} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
