"use client";

import { StatusBadge } from "@/components/security/StatusBadge";
import { formatClockTime, formatSourceLabel } from "@/lib/format-time";
import type { LoadState, SecurityEvent } from "@/types";

type DecisionTimelineProps = {
  events: SecurityEvent[] | null;
  status: LoadState;
};

export function DecisionTimeline({ events, status }: DecisionTimelineProps) {
  const items = (events ?? []).slice(0, 8);

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Security decision timeline">
      <h2 className="text-sm font-medium">Decision Timeline</h2>
      <p className="text-xs text-muted-foreground">Recent firewall decisions</p>
      {status === "loading" ? (
        <div className="mt-4 space-y-2" data-testid="timeline-skeleton">
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded bg-muted" />
        </div>
      ) : null}
      {status === "error" ? (
        <p className="mt-3 text-sm text-destructive">Unable to load security activity.</p>
      ) : null}
      {status === "empty" || (status === "success" && items.length === 0) ? (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">No security activity yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            AgentShield events will appear here when the agent performs actions.
          </p>
        </div>
      ) : null}
      {status === "success" && items.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {items.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-muted-foreground">
                  {formatClockTime(event.timestamp)}
                </p>
                <p className="truncate text-sm">
                  {formatSourceLabel(event.source_type)} → {event.tool_name}
                </p>
              </div>
              <StatusBadge decision={event.firewall_decision} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
